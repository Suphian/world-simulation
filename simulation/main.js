/* =======================================================================
  Alternate World Civilization & Geopolitics Simulator
  Vanilla JS + <canvas> rendering
  (CSS in simulation/style.css)
======================================================================= */

/* ---------------------------- BALANCE (tunables) ---------------------------- */
const BALANCE = {
  tick: { ms: 120, convoysPerRoute: 3, convoySpeed: 0.0025, colonizeTicks: 220, eventBaseCooldown: 40, effectDecay: 0.98, newsUpdateEvery: 3 },
  rng: { baseRandomness: 0.20, battleSwing: 0.15, eventSwing: 0.20, tradeVariance: 0.08 },
  geography: { hexRadius: 16, gridW: 42, gridH: 28, seaRatio: 0.55 },
  economy: {
    prosperityWeights: { agri:0.22, industry:0.20, trade:0.22, resources:0.10, infra:0.12, law:0.07, health:0.07 },
    taxIncomePerPoint: 0.18, tradeToTreasure: 0.5, patronageDrain: 0.03, armyUpkeep: 0.005, navyUpkeep: 0.006,
    blockadePenalty: 0.60, raidThroughputDrop: 0.5,
    resourceMultipliers: {
      Grain:        { prosperity: 0.10 },
      Ironwood:     { army: 0.12 },
      "Auric Salts":{ treasure: 0.12, trade: 0.08 },
      "Sky‑Amber":  { navy: 0.10, knowledge: 0.08 }
    },
    baseTreasury: 300
  },
  morale: {
    stabilityWeights: { cohesion:0.25, law:0.18, prosperity:0.20, religiousUnity:0.10, patronage:0.07 },
    stabilityNeg: { inequality:0.14, rigidity:0.08, tax:0.06, religiousConflict:0.10, warExhaustion:0.18 },
    cohesionPenaltyFromCentralization: 0.12
  },
  innovation: { weights: { literacy:0.25, universities:0.28, media:0.15, trade:0.10, urban:0.12, tolerance:0.10 },
                rigidityPenalty: 0.25 },
  military: {
    supplyFromInfra: 0.6, supplyFromLaw: 0.3, supplyFromHealth: 0.1,
    moraleFromStability: 0.65, moraleFromCohesion: 0.35,
    baseFlipChance: 0.08, terrainDefense: { land: 1.0, sea: 0.9, river: 1.1 },
    colonizeCost: 60, colonizeNavyReq: 50, colonizeArmyReq: 40
  },
  trade: { seaBonusFromNavy: 0.5, landBonusFromInfra: 0.5, blockadeRadius: 2, straitPenalty: 0.7, minRouteLen: 4,
           convoyDots: 18, raiderStrikeEvery: 120, pressureToRaid: 0.35 },
  diplomacy: { allianceBonus: 0.05, truceTicks: 90, guarantee: true },
             events: { perTickBaseChance: 0.001, weights: { economy:1.2, religion:1.0, war:1.0, culture:1.0, knowledge:1.0, corruption:0.8, outer:1.2 } }
};
window.BALANCE = BALANCE; // exposed for quick tuning

/* ----------------------------- Deterministic RNG ---------------------------- */
let _seed = 123456789;
function reseed(s){
  // FNV‑1a string hash → LCG seed
  let h = 2166136261 >>> 0;
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  _seed = h >>> 0;
}
function rnd(){ _seed = (1664525 * _seed + 1013904223) >>> 0; return _seed / 0xFFFFFFFF; }
function randRange(a,b){ return a + (b-a)*rnd(); }
function randInt(a,b){ return Math.floor(randRange(a,b+1)); }
function pick(arr){ return arr[Math.floor(rnd()*arr.length)] }
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const lerp=(a,b,t)=>a+(b-a)*t;

/* --------------------------------- State ----------------------------------- */
const state = {
  preset:'tess',
  tick:0, running:false, randomness:BALANCE.rng.baseRandomness,
  map:null, civs:[], relations:{}, wars:[], alliances:[], truce:[],
  colonizations:[], modifiers:[], toasts:[], news:"", showTest:false,
  lastRaidAt:0, fps:0, routes:[]
};

/* ---------------------------------- Map ------------------------------------ */
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
function resizeCanvas(){
  const dpr = Math.max(1, window.devicePixelRatio||1);
  const r = canvas.getBoundingClientRect();
  let w = Math.max(600, Math.floor(r.width)||0);
  let h = Math.max(560, Math.floor(r.height)||0);
  if(w===0 || h===0){
    // If grid hasn't laid out yet, force a size using viewport
    w = Math.max(600, Math.floor(window.innerWidth*0.45));
    h = Math.max(560, Math.floor(window.innerHeight*0.70));
    canvas.style.minWidth = w+'px';
    canvas.style.minHeight = h+'px';
  }
  canvas.width = w*dpr; canvas.height = h*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  map.sizePx.w=w; map.sizePx.h=h;
  
  // Debug: ensure canvas is visible
  canvas.style.display = 'block';
  canvas.style.visibility = 'visible';
  canvas.style.opacity = '1';
}
window.addEventListener('resize', resizeCanvas);

// Mouse hover functionality for map tooltips
const tooltip = document.getElementById('tooltip');
let hoveredHex = null;

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  
  // Convert pixel coordinates to hex coordinates
  const R = BALANCE.geography.hexRadius;
  const margin = 20;
  const totalW = Math.sqrt(3) * R * (map.w + 0.5);
  const totalH = R * 1.5 * (map.h + 0.5);
  const scale = Math.min((map.sizePx.w - 2 * margin) / totalW, (map.sizePx.h - 2 * margin) / totalH);
  
  // Transform coordinates back to hex space
  const hexX = (x - margin) / scale;
  const hexY = (y - margin) / scale;
  
  // Find the closest hex
  let closestHex = null;
  let minDist = Infinity;
  
  for (const hex of map.hexes) {
    const [hexPixelX, hexPixelY] = axialToPixel(hex.q, hex.r, R);
    const dist = Math.sqrt((hexX - hexPixelX) ** 2 + (hexY - hexPixelY) ** 2);
    if (dist < minDist && dist < R * 0.8) {
      minDist = dist;
      closestHex = hex;
    }
  }
  
  if (closestHex && closestHex !== hoveredHex) {
    hoveredHex = closestHex;
    showTooltip(closestHex, e.clientX, e.clientY);
  } else if (!closestHex && hoveredHex) {
    hoveredHex = null;
    hideTooltip();
  } else if (hoveredHex) {
    // Update tooltip position
    tooltip.style.left = (e.clientX + 10) + 'px';
    tooltip.style.top = (e.clientY - 10) + 'px';
  }
});

canvas.addEventListener('mouseleave', () => {
  hoveredHex = null;
  hideTooltip();
});

function showTooltip(hex, mouseX, mouseY) {
  const civ = hex.owner ? getCiv(hex.owner) : null;
  const neighbors = map.neighbors.get(hex.id) || [];
  const neighborCivs = [...new Set(neighbors.map(n => map.hexes[n].owner).filter(Boolean))];
  
  let content = `<h4>${hex.type === 'land' ? 'Land' : hex.type === 'sea' ? 'Sea' : 'Shoals'} Hex</h4>`;
  
  if (hex.capital) {
    content += `<div class="info-row"><span class="info-label">Capital:</span><span class="info-value">★ ${civ ? civ.name : 'Unknown'}</span></div>`;
  }
  
  if (hex.owner) {
    content += `<div class="info-row"><span class="info-label">Owner:</span><span class="info-value">${civ.name} (${civ.id})</span></div>`;
    content += `<div class="info-row"><span class="info-label">Government:</span><span class="info-value">${civ.government}</span></div>`;
    content += `<div class="info-row"><span class="info-label">Religion:</span><span class="info-value">${civ.religion}</span></div>`;
  } else if (hex.type === 'land') {
    content += `<div class="info-row"><span class="info-label">Status:</span><span class="info-value">Neutral (Colonizable)</span></div>`;
  }
  
  if (hex.resource) {
    content += `<div class="info-row"><span class="info-label">Resource:</span><span class="info-value">${hex.resource}</span></div>`;
  }
  
  if (hex.strait) {
    content += `<div class="info-row"><span class="info-label">Special:</span><span class="info-value">Strait (Trade Route)</span></div>`;
  }
  
  if (hex.river) {
    content += `<div class="info-row"><span class="info-label">Special:</span><span class="info-value">River</span></div>`;
  }
  
  if (map.outerShoals.has(hex.id)) {
    content += `<div class="info-row"><span class="info-label">Special:</span><span class="info-value">Outer Shoals</span></div>`;
  }
  
  if (neighborCivs.length > 0) {
    const neighborNames = neighborCivs.map(civId => getCiv(civId).name).join(', ');
    content += `<div class="info-row"><span class="info-label">Neighbors:</span><span class="info-value">${neighborNames}</span></div>`;
  }
  
  // Check for active trade routes
  const routes = state.routes.filter(r => r.via.includes(hex.id));
  if (routes.length > 0) {
    const routeInfo = routes.map(r => {
      const fromCiv = getCiv(r.ownerA);
      const toHex = map.hexes[r.to];
      const toResource = toHex.resource || (toHex.capital ? 'Capital' : 'Hex');
      return `${fromCiv.name}→${toResource}`;
    }).join(', ');
    content += `<div class="info-row"><span class="info-label">Trade Routes:</span><span class="info-value">${routeInfo}</span></div>`;
  }
  
  // Check for blockades
  const blockades = routes.filter(r => r.blocked && r.blockadeAt === hex.id);
  if (blockades.length > 0) {
    content += `<div class="info-row"><span class="info-label">Blockades:</span><span class="info-value">${blockades.length} active</span></div>`;
  }
  
  // Check for colonization
  const colonization = state.colonizations.find(c => c.hexId === hex.id);
  if (colonization) {
    const progress = Math.round((colonization.progress / BALANCE.tick.colonizeTicks) * 100);
    content += `<div class="info-row"><span class="info-label">Colonization:</span><span class="info-value">${progress}% complete</span></div>`;
  }
  
  tooltip.innerHTML = content;
  tooltip.style.left = (mouseX + 10) + 'px';
  tooltip.style.top = (mouseY - 10) + 'px';
  tooltip.style.display = 'block';
}

function hideTooltip() {
  tooltip.style.display = 'none';
}

const map = { w:BALANCE.geography.gridW, h:BALANCE.geography.gridH,
  hexes:[], neighbors:new Map(), seaStraits:new Set(),
  capitals:new Map(), resourceHexes:[], outerShoals:new Set(),
  neutralHexes:new Set(), colonizable:new Set(), sizePx:{w:0,h:0}
};
state.map = map;

// axial-to-pixel (odd‑r horizontal layout)
function axialToPixel(q,r,R){
  const x = R*Math.sqrt(3)*(q + 0.5*(r&1));
  const y = R*(3/2)*r;
  return [x,y];
}
function neighborCoords(q,r,dirIndex){
  const even = (r%2)===0;
  const dirs = even ? [[+1,0],[0,+1],[-1,+1],[-1,0],[-1,-1],[0,-1]]
                    : [[+1,0],[+1,+1],[0,+1],[-1,0],[0,-1],[+1,-1]];
  const [dq,dr]=dirs[dirIndex];
  return [q+dq, r+dr];
}
function hexDistance(aId,bId){
  const a=map.hexes[aId], b=map.hexes[bId];
  function toCube(q,r){ const x=q-(r - (r&1))/2; const z=r; const y=-x - z; return {x,y,z}; }
  const A=toCube(a.q,a.r), B=toCube(b.q,b.r);
  return Math.max(Math.abs(A.x-B.x), Math.abs(A.y-B.y), Math.abs(A.z-B.z));
}
function hasSeaNeighbor(id){ return map.neighbors.get(id).some(n=>['sea','shoals'].includes(map.hexes[n].type)); }

function generateMap(preset='tess'){
  const {gridW,gridH}=BALANCE.geography;
  map.w=gridW; map.h=gridH;
  map.hexes=[]; map.neighbors.clear(); map.seaStraits.clear();
  map.capitals.clear(); map.resourceHexes=[]; map.outerShoals.clear();
  map.neutralHexes.clear(); map.colonizable.clear();

  for(let r=0;r<gridH;r++){
    for(let q=0;q<gridW;q++){
      const id=q+r*gridW; let type='sea';
      const nx=(q/gridW)*2-1, ny=(r/gridH)*2-1;
      const inlandSea=(nx*nx*1.2 + ny*ny*0.6) < 0.9;
      if(!inlandSea) type='land';

      if(preset==='tess'){
        const noise=Math.sin(q*0.9)*Math.cos(r*0.6)+Math.sin((q+r)*0.3)*0.5;
        if(noise>0.7) type='land';
        if(noise<-0.85) type='sea';
      }else if(preset==='we1914'){
        type=(nx*nx*0.6 + ny*ny*1.6) < 0.8 ? 'land':'sea';
      }else if(preset==='bac1200'){
        type=(nx*nx*0.8 + ny*ny*1.2) < 0.85 ? 'land':'sea';
      }
      map.hexes.push({id,q,r,type,owner:null,resource:null,capital:false,strait:false,river:false});
    }
  }
  // Outer Shoals: ring of edge seas
  for(const h of map.hexes){
    if(h.type==='sea' && (h.q===0||h.r===0||h.q===map.w-1||h.r===map.h-1)){
      h.type='shoals'; map.outerShoals.add(h.id);
    }
  }
  // Neighbors
  for(const h of map.hexes){
    const list=[];
    for(let i=0;i<6;i++){
      const [nq,nr]=neighborCoords(h.q,h.r,i);
      if(nq>=0&&nr>=0&&nq<map.w&&nr<map.h) list.push(nq+nr*map.w);
    }
    map.neighbors.set(h.id,list);
  }
  // Straits = narrow seas bounded by land
  for(const h of map.hexes){
    if(h.type==='sea'){
      const neigh=map.neighbors.get(h.id);
      const landCount=neigh.map(i=>map.hexes[i].type).filter(t=>t!=='sea'&&t!=='shoals').length;
      if(landCount>=4){ h.strait=true; map.seaStraits.add(h.id); }
    }
  }
  // Place resource hexes (land)
  const resTypes=['Grain','Ironwood','Auric Salts','Sky‑Amber'];
  let placed=0, targetPerType=6;
  while(placed < resTypes.length*targetPerType){
    const id=randInt(0,map.hexes.length-1); const h=map.hexes[id];
    if(h.type==='land' && !h.resource){
      h.resource=resTypes[placed%resTypes.length]; map.resourceHexes.push(id); placed++;
    }
  }
  // Neutral land (colonizable)
  for(const h of map.hexes){ if(h.type==='land') { map.neutralHexes.add(h.id); map.colonizable.add(h.id); } }
}

/* ---------------------------- Civs / Presets ---------------------------- */
function makeDefaultCivs(){
  return [
    { id:'SAL', name:'The Salanic Empire', color:'#4FA3FF',
      motto:'"Iron fist, iron will, iron legacy."', strengths:['Centralized rule','Pre-Sundering knowledge','Organized military'],
      religion:'Imperial Cult', government:'Iron-fisted Monarchy',
      armyFlavor:'Professional legions with pre-Sundering tactics; organized navy',
      navyFlavor:'Organized navy with imperial doctrine',
      pillars:{ religion:75, government:90, economy:70, knowledge:85, culture:60, social:70,
                tolerance:40, churchState:80, media:45, cohesion:75, rigidity:85, inequality:70, centralization:90 },
      sec:{ pop:60, urban:65, infra:75, health:65, military:85, aggression:70, diplomacy:60, resources:75, tradeOpen:55, taxCapacity:80 }
    },
    { id:'LYR', name:'Kingdom of Lyrica', color:'#FF6E6E',
      motto:'"Faith and harmony, piety and order."', strengths:['Religious unity','Rich culture','Social stratification'],
      religion:'Divine Kingship', government:'Theocratic Monarchy',
      armyFlavor:'Faithful warriors; temple guard; religious navy',
      navyFlavor:'Religious navy with divine blessing',
      pillars:{ religion:95, government:80, economy:65, knowledge:55, culture:85, social:75,
                tolerance:30, churchState:95, media:40, cohesion:85, rigidity:80, inequality:75, centralization:75 },
      sec:{ pop:55, urban:60, infra:65, health:60, military:70, aggression:60, diplomacy:65, resources:65, tradeOpen:50, taxCapacity:70 }
    },
    { id:'THO', name:'Republic of Thornwall', color:'#7AD37A',
      motto:'"Commerce and discovery, innovation and liberty."', strengths:['Merchant power','Pragmatic knowledge','Seaborne trade'],
      religion:'Rational Humanism', government:'Merchant Council Republic',
      armyFlavor:'Citizen militia; merchant marines; innovative navy',
      navyFlavor:'Innovative navy with merchant doctrine',
      pillars:{ religion:40, government:70, economy:85, knowledge:80, culture:70, social:60,
                tolerance:75, churchState:25, media:80, cohesion:65, rigidity:45, inequality:55, centralization:60 },
      sec:{ pop:50, urban:80, infra:80, health:70, military:60, aggression:75, diplomacy:80, resources:70, tradeOpen:90, taxCapacity:65 }
    },
    { id:'KHA', name:'Khaldur Nomad Clans', color:'#FFD166',
      motto:'"Clan loyalty, warrior honor, tribal strength."', strengths:['Cavalry mastery','Survival skills','Clan cohesion'],
      religion:'Shamanistic Animism', government:'Tribal Confederation',
      armyFlavor:'Elite cavalry; tribal warriors; raiding craft',
      navyFlavor:'Raiding craft; coastal raiders',
      pillars:{ religion:60, government:45, economy:50, knowledge:35, culture:55, social:85,
                tolerance:50, churchState:40, media:30, cohesion:90, rigidity:70, inequality:60, centralization:40 },
      sec:{ pop:45, urban:35, infra:45, health:50, military:80, aggression:45, diplomacy:55, resources:60, tradeOpen:40, taxCapacity:45 }
    },
    { id:'GLA', name:'Glass League', color:'#B66DFF',
      motto:'"By lattice and ledger, all harbors prosper."', strengths:['Convoy doctrine','Knowledge guilds','Open trade'],
      religion:'Lattice of Saints', government:'Merchant Council',
      armyFlavor:'Light marines, pike companies; fast caravels and convoy doctrine',
      navyFlavor:'Fast caravels; convoy doctrine',
      pillars:{ religion:45, government:65, economy:85, knowledge:80, culture:70, social:45,
                tolerance:65, churchState:35, media:70, cohesion:60, rigidity:45, inequality:40, centralization:65 },
      sec:{ pop:52, urban:78, infra:72, health:68, military:70, aggression:90, diplomacy:80, resources:70, tradeOpen:85, taxCapacity:55 }
    }
  ].map(c=>({ ...c, treasury:BALANCE.economy.baseTreasury, warExhaustion:0,
              externalPressure:25, randomEventIntensity:50,
              morale:0, prosperity:0, innovation:0, softPower:0, lastTrade:0, colonizeDesire:0, modifiers:[] }));
}

// Presets (compact caricatures; same pillar semantics)
function makePresetCivs(id){
  if(id==='tess'){ state.outerPressureName='Outer Shoals'; return makeDefaultCivs(); }
  if(id==='we1914'){
    state.outerPressureName='Germany (Pressure)';
    return [
      {id:'FRA',name:'France',color:'#2fa4ff',motto:'"Honor and patrie."',strengths:['Large army','Industry','Alliances'],
       religion:'Laïcité',government:'Republic',
       pillars:{religion:40,government:70,economy:75,knowledge:75,culture:80,social:55,tolerance:70,churchState:20,media:75,cohesion:60,rigidity:50,inequality:52,centralization:70},
       sec:{pop:40,urban:70,infra:78,health:68,military:90,aggression:60,diplomacy:80,resources:65,tradeOpen:70,taxCapacity:60}},
      {id:'UK',name:'United Kingdom',color:'#ff2f2f',motto:'"Rule the waves."',strengths:['Navy','Finance','Empire'],
       religion:'Anglican pluralism',government:'Constitutional Monarchy',
       pillars:{religion:60,government:80,economy:85,knowledge:80,culture:75,social:60,tolerance:75,churchState:35,media:85,cohesion:62,rigidity:52,inequality:60,centralization:75},
       sec:{pop:45,urban:82,infra:82,health:70,military:65,aggression:100,diplomacy:85,resources:60,tradeOpen:85,taxCapacity:62}},
      {id:'BEL',name:'Belgium',color:'#ffd166',motto:'"Firm and faithful."',strengths:['Industry','Ports'],
       religion:'Catholic',government:'Monarchy',
       pillars:{religion:70,government:65,economy:70,knowledge:65,culture:60,social:55,tolerance:60,churchState:55,media:65,cohesion:58,rigidity:50,inequality:55,centralization:65},
       sec:{pop:10,urban:76,infra:75,health:65,military:45,aggression:30,diplomacy:60,resources:45,tradeOpen:80,taxCapacity:58}},
      {id:'NED',name:'Netherlands',color:'#7AD37A',motto:'"I will persevere."',strengths:['Trade','Ports','Finance'],
       religion:'Protestant pluralism',government:'Monarchy',
       pillars:{religion:55,government:70,economy:80,knowledge:75,culture:65,social:55,tolerance:78,churchState:30,media:80,cohesion:60,rigidity:50,inequality:52,centralization:65},
       sec:{pop:9,urban:78,infra:78,health:68,military:35,aggression:70,diplomacy:75,resources:50,tradeOpen:90,taxCapacity:60}},
      {id:'ESP',name:'Spain',color:'#B66DFF',motto:'"Plus Ultra."',strengths:['Ports','Colonies'],
       religion:'Catholic',government:'Monarchy',
       pillars:{religion:75,government:60,economy:60,knowledge:55,culture:70,social:60,tolerance:55,churchState:70,media:60,cohesion:62,rigidity:58,inequality:60,centralization:62},
       sec:{pop:20,urban:55,infra:60,health:60,military:55,aggression:55,diplomacy:60,resources:55,tradeOpen:70,taxCapacity:55}},
      {id:'PRT',name:'Portugal',color:'#4FA3FF',motto:'"Talant de bien faire."',strengths:['Seamanship','Ports'],
       religion:'Catholic',government:'Monarchy',
       pillars:{religion:70,government:55,economy:55,knowledge:55,culture:60,social:55,tolerance:60,churchState:60,media:60,cohesion:58,rigidity:56,inequality:58,centralization:58},
       sec:{pop:8,urban:52,infra:58,health:58,military:35,aggression:60,diplomacy:65,resources:50,tradeOpen:80,taxCapacity:55}}
    ].map(c=>({...c, treasury:BALANCE.economy.baseTreasury, warExhaustion:0, externalPressure:40, randomEventIntensity:50, morale:0, prosperity:0, innovation:0, softPower:0, lastTrade:0, colonizeDesire:0, modifiers:[] }));
  }
  if(id==='bac1200'){
    state.outerPressureName='Sea Peoples (Pressure)';
    return [
      {id:'EGY',name:'Egypt',color:'#ffd166',motto:'"Life, Prosperity, Health."',strengths:['Grain','Chariots'],
       religion:'State temples',government:'Pharaonic state',
       pillars:{religion:85,government:80,economy:70,knowledge:75,culture:80,social:70,tolerance:55,churchState:85,media:50,cohesion:70,rigidity:68,inequality:60,centralization:82},
       sec:{pop:30,urban:55,infra:75,health:60,military:70,aggression:40,diplomacy:70,resources:70,tradeOpen:65,taxCapacity:68}},
      {id:'HAT',name:'Hatti',color:'#ff6e6e',motto:'"Land of a thousand gods."',strengths:['Infantry','Alliances'],
       religion:'Polytheism',government:'Kingship',
       pillars:{religion:80,government:70,economy:65,knowledge:60,culture:70,social:65,tolerance:50,churchState:75,media:45,cohesion:68,rigidity:64,inequality:58,centralization:70},
       sec:{pop:20,urban:50,infra:60,health:55,military:80,aggression:35,diplomacy:65,resources:75,tradeOpen:55,taxCapacity:60}},
      {id:'MYC',name:'Mycenaeans',color:'#4FA3FF',motto:'"Lion‑gate proud."',strengths:['Seafaring','Fortresses'],
       religion:'Aegean cults',government:'Palace economy',
       pillars:{religion:70,government:65,economy:65,knowledge:55,culture:70,social:60,tolerance:55,churchState:60,media:45,cohesion:62,rigidity:58,inequality:56,centralization:62},
       sec:{pop:9,urban:48,infra:55,health:55,military:65,aggression:60,diplomacy:60,resources:55,tradeOpen:70,taxCapacity:55}},
      {id:'UGA',name:'Ugarit',color:'#B66DFF',motto:'"Write, weigh, and sail."',strengths:['Alphabet','Ports'],
       religion:'Levantine cults',government:'City‑king',
       pillars:{religion:60,government:65,economy:75,knowledge:80,culture:75,social:55,tolerance:65,churchState:45,media:70,cohesion:58,rigidity:50,inequality:52,centralization:60},
       sec:{pop:7,urban:70,infra:60,health:55,military:35,aggression:50,diplomacy:80,resources:45,tradeOpen:85,taxCapacity:58}},
      {id:'ASS',name:'Assyria',color:'#7AD37A',motto:'"Who dares defy the king?"',strengths:['Siege','Roads'],
       religion:'Ashur cult',government:'Kingship',
       pillars:{religion:80,government:80,economy:70,knowledge:65,culture:60,social:70,tolerance:45,churchState:80,media:45,cohesion:68,rigidity:66,inequality:60,centralization:80},
       sec:{pop:18,urban:48,infra:65,health:55,military:85,aggression:30,diplomacy:55,resources:75,tradeOpen:50,taxCapacity:65}}
    ].map(c=>({...c, treasury:BALANCE.economy.baseTreasury, warExhaustion:0, externalPressure:50, randomEventIntensity:55, morale:0, prosperity:0, innovation:0, softPower:0, lastTrade:0, colonizeDesire:0, modifiers:[] }));
  }
}

/* ------------------------------ Placement -------------------------------- */
function placeCivs(civs, preset){
  // Coastal capitals with spacing
  const candidates = map.hexes.filter(h=>h.type==='land' && hasSeaNeighbor(h.id));
  const chosen=[];
  function far(id,minD){ for(const o of chosen){ if(hexDistance(id,o)<minD) return false; } return true; }
  for(const civ of civs){
    let pid=-1, tries=0;
    while(tries++<500){ const cand=pick(candidates).id; if(far(cand,7)){ pid=cand; break; } }
    if(pid<0) pid=pick(candidates).id;
    const h=map.hexes[pid]; h.capital=true; h.owner=civ.id; map.capitals.set(civ.id,pid);
    map.neutralHexes.delete(pid); chosen.push(pid);
    for(const nid of map.neighbors.get(pid)){ const nh=map.hexes[nid];
      if(nh.type==='land' && nh.owner==null){ nh.owner=civ.id; map.neutralHexes.delete(nid); }
    }
  }
  // Light expansion around each capital
  for(const civ of civs){
    const frontier=map.hexes.filter(h=>h.owner===civ.id).map(h=>h.id);
    for(let pass=0; pass<10; pass++){
      const base=pick(frontier); for(const nid of map.neighbors.get(base)){
        const nh=map.hexes[nid];
        if(nh.type==='land' && nh.owner==null && rnd()<0.2){
          nh.owner=civ.id; map.neutralHexes.delete(nid); frontier.push(nid);
        }
      }
    }
  }
  map.colonizable=new Set([...map.neutralHexes]);

  // Relations baseline
  state.relations={};
  for(let i=0;i<civs.length;i++) for(let j=i+1;j<civs.length;j++) setRelation(civs[i].id,civs[j].id,'peace',0);

  // Flavor alliances
  if(preset==='tess'){ 
    // Start with no alliances as requested
    // setRelation('SAL','LYR','alliance',0); 
  }
  if(preset==='we1914'){ setRelation('FRA','UK','alliance',0); setRelation('FRA','BEL','alliance',0); setRelation('UK','NED','alliance',0); }
  if(preset==='bac1200'){ setRelation('EGY','UGA','alliance',0); }
}

/* ----------------------------- Pathfinding -------------------------------- */
function pathfind(fromId,toId,mode){
  const passable=(id)=>{
    const t=map.hexes[id].type;
    if(mode==='sea') return t==='sea'||t==='shoals';
    if(mode==='land') return t==='land';
    return true;
  };
  const Q=[fromId], came=new Map([[fromId,null]]);
  while(Q.length){
    const cur=Q.shift(); if(cur===toId) break;
    for(const nid of map.neighbors.get(cur)){
      if(!came.has(nid) && passable(nid)){ came.set(nid,cur); Q.push(nid); }
    }
  }
  if(!came.has(toId)) return null;
  const path=[]; let cur=toId; while(cur!=null){ path.push(cur); cur=came.get(cur); } path.reverse(); return path;
}

/* --------------------------- Trade Routes & Navy --------------------------- */
function scheduleConvoys(path){ const dots=[]; for(let i=0;i<BALANCE.trade.convoyDots;i++) dots.push({t:i/BALANCE.trade.convoyDots, flash:0, raided:false}); return dots; }

function computeTradeRoutes(){
  state.routes=[];
  const capitals=[...map.capitals.values()];
  const resHexes=map.resourceHexes.slice();

  // Capital ↔ capital sea routes
  for(const a of capitals) for(const b of capitals){
    if(a===b) continue;
    const civA=map.hexes[a].owner, civB=map.hexes[b].owner;
    if(getRelation(civA,civB)==='war') continue;
    const aSea = map.neighbors.get(a).find(id=>map.hexes[id].type!=='land');
    const bSea = map.neighbors.get(b).find(id=>map.hexes[id].type!=='land');
    if(aSea!=null && bSea!=null){
      const path=pathfind(aSea,bSea,'sea');
      if(path && path.length>=BALANCE.trade.minRouteLen){
        state.routes.push({type:'sea', from:a, to:b, via:path, ownerA:civA, ownerB:civB, blocked:false, blockadeAt:null, convoys:scheduleConvoys(path), cargo:'Mixed'});
      }
    }
  }

  // Capital → resource (land or sea-assisted)
  for(const capId of capitals){
    const owner=map.hexes[capId].owner;
    for(const resId of resHexes){
      const R=map.hexes[resId]; if(R.type!=='land') continue;
      let path=null, type=null;
      // overland
      path=pathfind(capId,resId,'land');
      if(path && path.length>=BALANCE.trade.minRouteLen){ type='land'; }
      else{
        const aSea=map.neighbors.get(capId).find(id=>map.hexes[id].type!=='land');
        const coast=map.neighbors.get(resId).find(id=>map.hexes[id].type!=='land');
        if(aSea!=null && coast!=null){
          const seaPath=pathfind(aSea,coast,'sea');
          if(seaPath && seaPath.length>=BALANCE.trade.minRouteLen){ path=[capId,aSea,...seaPath,coast,resId]; type='sea'; }
        }
      }
      if(path && type){
        state.routes.push({type, from:capId, to:resId, via:path, ownerA:owner, ownerB:R.owner, res:R.resource,
                           blocked:false, blockadeAt:null, convoys:scheduleConvoys(path), cargo:R.resource});
      }
    }
  }
}

function updateBlockades(){
  for(const route of state.routes){
    if(route.type!=='sea'){ route.blocked=false; route.blockadeAt=null; continue; }
    route.blocked=false; route.blockadeAt=null;
    for(const id of route.via){
      if(map.seaStraits.has(id)){
        const neigh=map.neighbors.get(id);
        const adjOwners=new Set(neigh.map(n=>map.hexes[n].owner).filter(Boolean));
        let maxOwner=null, max=0, second=0;
        for(const civId of adjOwners){
          const navy=effectiveNavy(getCiv(civId));
          if(navy>max){ second=max; max=navy; maxOwner=civId; }
          else if(navy>second){ second=navy; }
        }
        if(maxOwner && max>second*1.15){
          if(maxOwner!==route.ownerA){ route.blocked=true; route.blockadeAt=id; break; }
        }
      }
    }
  }
}
function throughputForRoute(route){
  const civA=getCiv(route.ownerA);
  let civB=null; const oh=map.hexes[route.to]; if(oh) civB=getCiv(oh.owner);
  const openA=civA.sec.tradeOpen, openB=civB ? civB.sec.tradeOpen : 60;
  const base=(openA+openB)/2/100;
  const infra=(civA.sec.infra + (civB?civB.sec.infra:60))/2/100;
  const stability=(civA.morale + (civB?civB.morale:60))/200;
  const typeBonus=route.type==='sea' ? (1 + BALANCE.trade.seaBonusFromNavy*(effectiveNavy(civA)/100))
                                     : (1 + BALANCE.trade.landBonusFromInfra*(civA.sec.infra/100));
  const blockedPenalty = route.blocked ? BALANCE.economy.blockadePenalty : 1;
  const variance = 1 + (rnd()*2-1) * BALANCE.rng.tradeVariance * state.randomness;
  return clamp(base * (0.6*infra + 0.4*stability) * typeBonus * blockedPenalty * variance, 0, 1.8);
}

/* -------------------------- Diplomacy helpers --------------------------- */
function getCiv(id){ return state.civs.find(c=>c.id===id); }
function setRelation(a,b,status,since){ const k=a<b?`${a}|${b}`:`${b}|${a}`; state.relations[k]={state:status, sinceTick:since??state.tick}; }
function getRelation(a,b){ if(!a||!b||a===b) return 'self'; const k=a<b?`${a}|${b}`:`${b}|${a}`; return state.relations[k]?.state ?? 'peace'; }
function inWar(a,b){ return getRelation(a,b)==='war'; }
function allied(a,b){ return getRelation(a,b)==='alliance'; }
function setWar(a,b){ 
  if(a===b || inWar(a,b)) return; 
  setRelation(a,b,'war',state.tick); 
  state.wars.push({a,b}); 
  
  // Get a random hex from one of the warring civilizations for location
  const aHexes = map.hexes.filter(h => h.owner === a);
  const bHexes = map.hexes.filter(h => h.owner === b);
  let location = null;
  if(aHexes.length > 0) {
    const randomHex = pick(aHexes);
    const [x, y] = axialToPixel(randomHex.q, randomHex.r, 20);
    location = {x, y};
  } else if(bHexes.length > 0) {
    const randomHex = pick(bHexes);
    const [x, y] = axialToPixel(randomHex.q, randomHex.r, 20);
    location = {x, y};
  }
  
  logEvent(`⚔️ War declared between ${a} and ${b}.`, null, location); 
}
function setPeace(a,b){
  if(!inWar(a,b)) return;
  setRelation(a,b,'truce',state.tick);
  state.wars = state.wars.filter(w=>!((w.a===a&&w.b===b)||(w.a===b&&w.b===a)));
  
  // Get a random hex from one of the civilizations for location
  const aHexes = map.hexes.filter(h => h.owner === a);
  const bHexes = map.hexes.filter(h => h.owner === b);
  let location = null;
  if(aHexes.length > 0) {
    const randomHex = pick(aHexes);
    const [x, y] = axialToPixel(randomHex.q, randomHex.r, 20);
    location = {x, y};
  } else if(bHexes.length > 0) {
    const randomHex = pick(bHexes);
    const [x, y] = axialToPixel(randomHex.q, randomHex.r, 20);
    location = {x, y};
  }
  
  logEvent(`🕊️ Truce signed by ${a} and ${b}.`, null, location);
}
function checkAlliesJoin(){
  const thr = +document.getElementById('allyPressure').value || 65;
  for(const w of state.wars.slice()){
    for(const civ of state.civs){
      if(allied(civ.id, w.a) && !inWar(civ.id, w.b) && getCiv(w.a).externalPressure>=thr){
        setWar(civ.id, w.b);
      }
      if(allied(civ.id, w.b) && !inWar(civ.id, w.a) && getCiv(w.b).externalPressure>=thr){
        setWar(civ.id, w.a);
      }
    }
  }
}

/* ---------------------------- Derived Indices ---------------------------- */
function getRuleOfLaw(civ){ return clamp((civ.pillars.government*0.7 + (civ.sec.infra||50)*0.2 + 10), 0, 100); }
function getReligiousUnity(civ){ return civ.pillars.religion; }
function getPatronage(civ){ return civ.pillars.culture; }
function getRigidity(civ){ return civ.pillars.rigidity ?? civ.pillars.social; }
function getInequality(civ){ return civ.pillars.inequality ?? (civ.pillars.social*0.8); }
function getTolerance(civ){ return civ.pillars.tolerance ?? (civ.pillars.religion*0.5 + 35); }
function getLiteracy(civ){ return clamp(civ.pillars.knowledge*0.85 + 8, 0, 100); }
function getMedia(civ){ return civ.pillars.media ?? clamp(civ.pillars.knowledge*0.6 + 20, 0, 100); }
function getUniversities(civ){ return civ.pillars.knowledge; }
function getCulturalPrestige(civ){ return civ.pillars.culture; }
function getCohesion(civ){ const penalty=BALANCE.morale.cohesionPenaltyFromCentralization*( (civ.pillars.centralization ?? civ.pillars.government)/100 ); return clamp((civ.pillars.cohesion ?? civ.pillars.social) - penalty*100,0,100); }

function supplyFactor(civ){
  const S=civ.sec;
  const sf = BALANCE.military.supplyFromInfra*(S.infra/100) + BALANCE.military.supplyFromLaw*(getRuleOfLaw(civ)/100) + BALANCE.military.supplyFromHealth*(S.health/100);
  return clamp(0.6 + sf*0.6, 0.3, 1.6);
}
function moraleFactor(civ){ const mf=BALANCE.military.moraleFromStability*(civ.morale/100) + BALANCE.military.moraleFromCohesion*(getCohesion(civ)/100); return clamp(0.6 + mf*0.6, 0.5, 1.8); }

function ownedResources(civId){ const set=new Set(); for(const id of map.resourceHexes){ const h=map.hexes[id]; if(h.owner===civId && h.resource) set.add(h.resource); } return set; }
function effectiveArmy(civ){
  let base = civ.sec.military * (civ.pillars.economy/100) * supplyFactor(civ) * moraleFactor(civ);
  if(ownedResources(civ.id).has('Ironwood')) base *= (1 + BALANCE.economy.resourceMultipliers['Ironwood'].army);
  return base/100; // normalized
}
function effectiveNavy(civ){
  let base = civ.sec.military * (civ.pillars.economy/100) * supplyFactor(civ) * moraleFactor(civ);
  if(ownedResources(civ.id).has('Sky‑Amber')) base *= (1 + BALANCE.economy.resourceMultipliers['Sky‑Amber'].navy);
  return base/100; // normalized
}

function recalcDerived(){
  for(const civ of state.civs){
    const P=civ.pillars, S=civ.sec;
    const isAtWar = Object.keys(state.relations).some(k=>{ const [a,b]=k.split('|'); return (a===civ.id||b===civ.id) && state.relations[k].state==='war'; });
    const warPenalty = isAtWar ? 10 + civ.warExhaustion*0.6 : civ.warExhaustion*0.3;

    const pw=BALANCE.economy.prosperityWeights;
    const prosperity = (pw.agri*(S.agri ?? P.economy) + pw.industry*(S.industry ?? P.economy) +
                        pw.trade*(S.tradeOpen) + pw.resources*(S.resources) +
                        pw.infra*(S.infra) + pw.law*(getRuleOfLaw(civ)) + pw.health*(S.health)) - warPenalty;
    civ.prosperity = clamp(prosperity, 0, 100);

    const law=getRuleOfLaw(civ);
    const stabW=BALANCE.morale.stabilityWeights, neg=BALANCE.morale.stabilityNeg;
    const taxBurden=S.taxCapacity ?? 50;
    const religiousConflict = Math.abs(P.religion - getReligiousUnity(civ)) * 0.05 + (getTolerance(civ)<40?8:0);
    const baseStability = (stabW.cohesion*(getCohesion(civ)) + stabW.law*law + stabW.prosperity*civ.prosperity + stabW.religiousUnity*(getReligiousUnity(civ)) + stabW.patronage*(getPatronage(civ)));
    const negatives = (neg.inequality*(getInequality(civ)) + neg.rigidity*(getRigidity(civ)) + neg.tax*(taxBurden) + neg.religiousConflict*(religiousConflict) + neg.warExhaustion*(civ.warExhaustion));
    civ.morale = clamp( (baseStability - negatives), 0, 100 );

    const iw=BALANCE.innovation.weights;
    const innovation = (iw.literacy*(getLiteracy(civ)) + iw.universities*(getUniversities(civ)) + iw.media*(getMedia(civ)) + iw.trade*(S.tradeOpen) + iw.urban*(S.urban) + iw.tolerance*(getTolerance(civ))) - BALANCE.innovation.rigidityPenalty*(getRigidity(civ));
    civ.innovation = clamp(innovation, 0, 100);

    civ.softPower = clamp((getCulturalPrestige(civ)*0.4 + S.diplomacy*0.35 + S.tradeOpen*0.15 + law*0.10), 0, 100);

    // Treasury dynamics
    const taxIncome = (S.taxCapacity*0.01) * (civ.prosperity/100) * (S.pop/100) * BALANCE.economy.taxIncomePerPoint * 100;
    const tradeIncome = civ.lastTrade * BALANCE.economy.tradeToTreasure;
    const patronageDrain = getPatronage(civ) * BALANCE.economy.patronageDrain;
    const upkeep = (S.military * BALANCE.economy.armyUpkeep);
    civ.treasury = clamp(civ.treasury + taxIncome + tradeIncome - patronageDrain - upkeep, 0, 9999);

    // War exhaustion drift
    civ.warExhaustion = clamp(civ.warExhaustion + (isAtWar ? 0.35 : -0.25), 0, 100);
  }
}

/* ---------------------------- War & Colonization ------------------------- */
let flareAnimations=[]; // {id,t,color?}
function battleTick(){
  const contested=[];
  for(const h of map.hexes){
    if(h.owner==null || h.type!=='land') continue;
    for(const nid of map.neighbors.get(h.id)){
      const nh=map.hexes[nid];
      if(nh.owner && nh.owner!==h.owner && inWar(h.owner,nh.owner)) contested.push([h.id,nid]);
    }
  }
  for(const [aId,bId] of contested){
    const aOwner=map.hexes[aId].owner, bOwner=map.hexes[bId].owner; if(!aOwner||!bOwner) continue;
    const A=getCiv(aOwner), B=getCiv(bOwner);
    const pA=effectiveArmy(A)*moraleFactor(A)*(1+(rnd()*2-1)*BALANCE.rng.battleSwing*state.randomness);
    const pB=effectiveArmy(B)*moraleFactor(B)*(1+(rnd()*2-1)*BALANCE.rng.battleSwing*state.randomness);
    const ratio=pA/(pB+1e-5);
    const flipChance=BALANCE.military.baseFlipChance*clamp(ratio,0.2,5);
    if(rnd()<flipChance){
      const winner=pA>pB?aOwner:bOwner, loser=winner===aOwner?bOwner:aOwner;
      const targetId=winner===aOwner?bId:aId;
      flipHex(targetId,winner,loser);
      const hex = map.hexes[targetId];
      const [x, y] = axialToPixel(hex.q, hex.r, 20);
      logEvent(`⚔️ ${winner} captured territory from ${loser}.`, null, {x, y});
    }
  }
}
function flipHex(id,newOwner,oldOwner){
  const h=map.hexes[id]; h.owner=newOwner; map.neutralHexes.delete(id);
  flareAnimations.push({id, t:0});
  getCiv(newOwner).warExhaustion = clamp(getCiv(newOwner).warExhaustion+1.5,0,100);
  getCiv(oldOwner).warExhaustion = clamp(getCiv(oldOwner).warExhaustion+2.0,0,100);
}

function colonizationAI(){
  for(const civ of state.civs){
    if(civ.prosperity>55 && civ.morale>55 && civ.treasury>BALANCE.military.colonizeCost &&
       (civ.sec.military>BALANCE.military.colonizeArmyReq)){
      if(rnd()<0.02){
        const capId=map.capitals.get(civ.id);
        let cand=null,best=999;
        for(const id of map.colonizable){
          const h=map.hexes[id]; if(h.type!=='land') continue;
          const d=hexDistance(capId,id);
          if(d<best && hasSeaNeighbor(id)){ cand=id; best=d; }
        }
        if(cand!=null){
          state.colonizations.push({civId:civ.id, hexId:cand, progress:0, cost:BALANCE.military.colonizeCost});
          civ.treasury -= BALANCE.military.colonizeCost;
          map.colonizable.delete(cand);
          const hex = map.hexes[cand];
          const [x, y] = axialToPixel(hex.q, hex.r, 20);
          logEvent(`🧭 ${civ.id} launched a colonial expedition.`, null, {x, y});
          
          // Add flash animation for the new territory being targeted
          const civColor = civ.color || '#4FA3FF';
          flareAnimations.push({id:hex.id, t:0, color:civColor, type:'colonization_start'});
        }
      }
    }
  }
}
function colonizationTick(){
  for(const col of state.colonizations){
    col.progress++;
    const hex=map.hexes[col.hexId];
    if(col.progress>=BALANCE.tick.colonizeTicks){
      hex.owner=col.civId; flareAnimations.push({id:hex.id, t:0, color:'#aee67a'});
      const [x, y] = axialToPixel(hex.q, hex.r, 20);
      logEvent(`🏝️ ${col.civId} established a colony.`, null, {x, y});
      if(!hex.resource && rnd()<0.4){ const rt=pick(['Grain','Ironwood','Auric Salts','Sky‑Amber']); hex.resource=rt; map.resourceHexes.push(hex.id); logEvent(`🔎 ${col.civId} discovered ${rt} at the colony.`, null, {x, y}); }
    }
  }
  state.colonizations=state.colonizations.filter(c=>c.progress<BALANCE.tick.colonizeTicks);
}

/* ------------------------------- Events ---------------------------------- */
const EVENTS = [
  {id:'schism', title:'Doctrinal Schism', icon:'✝️', cat:'religion', desc:'Factions dispute orthodoxy, stressing unity.',
   trigger:c=>c.pillars.religion>70 && rnd()<0.008, cooldown:90, effects:[{key:'morale',op:'add',amount:-8,duration:60}]},
  {id:'revival', title:'Religious Revival', icon:'⛪', cat:'religion', desc:'Pilgrimages and donations swell the faithful.',
   trigger:c=>c.pillars.religion>60 && rnd()<0.03, cooldown:90, effects:[{key:'morale',op:'add',amount:+6,duration:50},{key:'treasury',op:'add',amount:+40,duration:1}]},
  {id:'harvestFail', title:'Harvest Failure', icon:'🌾', cat:'economy', desc:'Poor rains cut the surplus.',
   trigger:c=>c.sec.pop>30 && rnd()<0.025, cooldown:80, effects:[{key:'prosperity',op:'add',amount:-10,duration:50}]},
  {id:'famineRelief', title:'Famine Relief', icon:'🧺', cat:'economy', desc:'Granaries opened; prices stabilized.',
   trigger:c=>c.treasury>200 && rnd()<0.02, cooldown:80, effects:[{key:'morale',op:'add',amount:+8,duration:40},{key:'treasury',op:'add',amount:-60,duration:1}]},
  {id:'industrialBoom', title:'Industrial Boom', icon:'🏭', cat:'economy', desc:'New workshops accelerate output.',
   trigger:c=>c.pillars.economy>70 && rnd()<0.03, cooldown:120, effects:[{key:'sec.industry',op:'add',amount:+8,duration:90}]},
  {id:'mineCollapse', title:'Mine Collapse', icon:'⛏️', cat:'economy', desc:'A major mine halts production.',
   trigger:c=>rnd()<0.02, cooldown:120, effects:[{key:'sec.resources',op:'add',amount:-12,duration:90}]},
  {id:'printingSurge', title:'Printing Surge', icon:'🖨️', cat:'knowledge', desc:'Pamphlets spread ideas far and fast.',
   trigger:c=>c.pillars.knowledge>65 && rnd()<0.03, cooldown:100, effects:[{key:'pillars.knowledge',op:'add',amount:+6,duration:80},{key:'morale',op:'add',amount:-3,duration:50}]},
  {id:'censorship', title:'Censorship Drive', icon:'🚫', cat:'knowledge', desc:'Scribes seize texts deemed subversive.',
   trigger:c=>c.pillars.government>70 && rnd()<0.02, cooldown:100, effects:[{key:'pillars.knowledge',op:'add',amount:-8,duration:60},{key:'morale',op:'add',amount:-4,duration:40}]},
  {id:'goldenAge', title:'Golden Age', icon:'🏺', cat:'culture', desc:'Patrons sponsor a flowering of arts.',
   trigger:c=>c.pillars.culture>70 && c.treasury>300 && rnd()<0.02, cooldown:140, effects:[{key:'pillars.culture',op:'add',amount:+10,duration:100},{key:'treasury',op:'add',amount:-80,duration:1}]},
  {id:'taxReform', title:'Tax Reform', icon:'💰', cat:'government', desc:'Streamlined levies improve compliance.',
   trigger:c=>c.pillars.government>65 && rnd()<0.03, cooldown:120, effects:[{key:'sec.taxCapacity',op:'add',amount:+10,duration:120}]},
  {id:'navalBlockade', title:'Naval Blockade', icon:'⛵', cat:'war', desc:'Enemy squadrons interdict straits.',
   trigger:c=>c.sec.navy>60 && rnd()<0.03, cooldown:130, effects:[{key:'tradeBlocked',op:'flag',amount:1,duration:70}]},
  {id:'generalStrike', title:'General Strike', icon:'✊', cat:'economy', desc:'Workers halt mills and ports.',
   trigger:c=>getRigidity(c)<50 && rnd()<0.02, cooldown:120, effects:[{key:'prosperity',op:'add',amount:-8,duration:60},{key:'morale',op:'add',amount:-6,duration:60}]},
  {id:'antiCorruption', title:'Anti‑Corruption Drive', icon:'🧹', cat:'government', desc:'Audits and arrests deter graft.',
   trigger:c=>c.pillars.government>60 && rnd()<0.03, cooldown:120, effects:[{key:'pillars.government',op:'add',amount:+6,duration:100},{key:'morale',op:'add',amount:+4,duration:80}]},
  {id:'shoalsIncursion', title:'Outer Shoals Incursion', icon:'🏴‍☠️', cat:'outer', desc:'Raiders strike convoys and coasts.',
   trigger:c=>rnd()< (state.civs.indexOf(c)===0 ? state.civs.reduce((a,x)=>a+x.externalPressure,0)/state.civs.length/500 : 0), cooldown:90,
   effects:[{key:'raid',op:'raid',amount:1,duration:1}]},
  {id:'colonialUprising', title:'Colonial Uprising', icon:'🔥', cat:'war', desc:'Resistance flares in overseas holdings.',
   trigger:c=>rnd()<0.02, cooldown:160, effects:[{key:'morale',op:'add',amount:-6,duration:80}]},
  {id:'peaceConference', title:'Peace Conference', icon:'🕊️', cat:'diplomacy', desc:'Envoys seek to end conflicts.',
   trigger:c=>rnd()<0.015, cooldown:200, effects:[{key:'peace',op:'peace',amount:1,duration:1}]}
];
const eventCooldowns=new Map();
function runEvents(){
  for(const civ of state.civs){
    const base = BALANCE.events.perTickBaseChance * (civ.randomEventIntensity/50);
    for(const ev of EVENTS){
      const key=civ.id+'|'+ev.id, cd=eventCooldowns.get(key)||0; if(state.tick<cd) continue;
      if((rnd()<base) && ev.trigger(civ)){ applyEvent(civ,ev); eventCooldowns.set(key, state.tick + (ev.cooldown||BALANCE.tick.eventBaseCooldown)); }
    }
  }
}
function applyEvent(civ, ev){
  const title = `${ev.icon||'✦'} ${ev.title} — ${civ.id}`;
  
  // Get a random hex owned by this civilization for location
  const ownedHexes = map.hexes.filter(h => h.owner === civ.id);
  let location = null;
  if(ownedHexes.length > 0) {
    const randomHex = pick(ownedHexes);
    const [x, y] = axialToPixel(randomHex.q, randomHex.r, 20);
    location = {x, y};
  }
  
  logEvent(title, ev.desc, location); toast(title, ev.desc);
  for(const eff of ev.effects){
    if(eff.op==='add'){ state.modifiers.push({id:ev.id, civId:civ.id, key:eff.key, amount:eff.amount, untilTick: state.tick + eff.duration}); }
    else if(eff.op==='flag'){ if(eff.key==='tradeBlocked'){ for(const r of state.routes){ if(r.ownerA===civ.id){ r.blocked=true; r.blockadeAt=r.via[Math.floor(r.via.length/2)]||null; } } } }
    else if(eff.op==='raid'){ raiderStrike(); }
    else if(eff.op==='peace'){ const w=state.wars[0]; if(w) setPeace(w.a,w.b); }
  }
}
function applyModifiers(){
  for(const mod of state.modifiers){
    const civ=getCiv(mod.civId); if(!civ) continue;
    const parts=mod.key.split('.'); let obj=civ; for(let i=0;i<parts.length-1;i++) obj=obj[parts[i]];
    const last=parts[parts.length-1];
    if(obj && typeof obj[last]==='number') obj[last]+=mod.amount;
    else if(last in civ && typeof civ[last]==='number') civ[last]+=mod.amount;
  }
  state.modifiers = state.modifiers.filter(m=> state.tick < m.untilTick);
}

/* ---------------------------- Raiders / Pressure ------------------------- */
function raiderStrike(){
  const seaRoutes=state.routes.filter(r=>r.type==='sea'); if(!seaRoutes.length) return;
  const route=pick(seaRoutes);
  for(const d of route.convoys){ d.flash=1; d.raided=true; }
  route.blocked=true; route.blockadeAt = route.blockadeAt || pick(route.via);
  toast('🏴‍☠️ Raiders!', 'Outer Shoals strike a convoy lane.');
  if(route.blockadeAt) {
    const hex = map.hexes[route.blockadeAt];
    const [x, y] = axialToPixel(hex.q, hex.r, 20);
    logEvent('🏴‍☠️ Raiders disrupted a convoy lane.', null, {x, y});
  } else {
    logEvent('🏴‍☠️ Raiders disrupted a convoy lane.');
  }
}

/* ------------------------------ UI / Logging ----------------------------- */
const logEl=document.getElementById('log');
function logEvent(title,body,location=null){
  const time=`t${state.tick}`;
  const div=document.createElement('div'); div.className='log-entry';
  div.innerHTML=`<div><span class="small">${time}</span> <strong>${title}</strong></div>${body?`<div class="small">${body}</div>`:''}`;
  while(logEl.children.length>200) logEl.removeChild(logEl.firstChild);
  logEl.appendChild(div); logEl.scrollTop=logEl.scrollHeight;
  
  // Add to news feed if it's a significant event
  if (title.includes('🔥') || title.includes('⚔️') || title.includes('🌟') || title.includes('🧭') || title.includes('🏝️') || title.includes('🔎')) {
    if (!state.newsEvents) state.newsEvents = [];
    state.newsEvents.unshift({ time, title, body, location });
    if (state.newsEvents.length > 50) state.newsEvents.pop(); // Keep only recent events
  }
  
  // Add to map events if location is provided
  if (location && !state.mapEvents) state.mapEvents = [];
  if (location) {
    state.mapEvents.push({ time, title, x: location.x, y: location.y, tick: state.tick });
    // Keep only recent map events (last 20)
    if (state.mapEvents.length > 20) state.mapEvents.shift();
  }
}
const toastEl=document.getElementById('toasts');
function toast(title, body){
  const t=document.createElement('div'); t.className='toast'; t.innerHTML=`<div><strong>${title}</strong></div>${body?`<div class="small">${body}</div>`:''}`;
  toastEl.appendChild(t);
  setTimeout(()=>{ t.style.transition='opacity 0.6s'; t.style.opacity='0'; setTimeout(()=>t.remove(),800); }, 2500);
}

/* -------------------------------- HUD table ------------------------------ */
const hudBody=document.getElementById('hudRows');
function updateHUD(){
  hudBody.innerHTML='';
  for(const civ of state.civs){
    const owned=map.hexes.filter(h=>h.owner===civ.id).length;
    const atWar=Object.keys(state.relations).some(k=>{ const [a,b]=k.split('|'); return (a===civ.id||b===civ.id) && state.relations[k].state==='war'; });
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td><span class="badge" style="background:${civ.color}22;border-color:${civ.color}">${civ.id}</span></td>
      <td>${civ.prosperity.toFixed(1)}</td>
      <td>${civ.treasury.toFixed(0)}</td>
      <td>${(effectiveArmy(civ)*100).toFixed(0)}</td>
      <td>${civ.sec.aggression.toFixed(0)}</td>
      <td>${civ.morale.toFixed(1)}</td>
      <td>${owned}</td>
      <td>${atWar?'<span class="bad">War</span>':'—'}</td>
      <td>${civ.lastTrade.toFixed(1)}</td>`;
    hudBody.appendChild(tr);
  }
}

/* --------------------------- Identity cards UI --------------------------- */
const idCardsEl=document.getElementById('idCards');
function renderIdentityCards(){
  idCardsEl.innerHTML='';
  for(const c of state.civs){
    const card=document.createElement('div'); 
    card.className='card';
    card.style.setProperty('--civ-color', c.color);
    
    card.innerHTML=`
      <div class="idtag">
        <div class="swatch" style="background:${c.color}"></div>
        <span>${c.name}</span>
        <span class="badge" style="background:${c.color}22;border-color:${c.color}">${c.id}</span>
      </div>
      <div class="motto">${c.motto}</div>
      
      <div class="card-section">
        <div class="card-label">Religion & Government</div>
        <div class="card-value">
          <strong>${c.religion}</strong> • <strong>${c.government}</strong>
        </div>
      </div>
      
      <div class="card-section">
        <div class="card-label">Military Doctrine</div>
        <div class="card-value">${c.armyFlavor}</div>
      </div>
      
      <div class="card-section">
        <div class="card-label">Key Strengths</div>
        <div class="strengths-list">
          ${c.strengths.map(strength => `<span class="strength-tag">${strength}</span>`).join('')}
        </div>
      </div>`;
    idCardsEl.appendChild(card);
  }
}

/* ------------------------------ Controls bind ---------------------------- */
const speed=document.getElementById('speed'), speedVal=document.getElementById('speedVal');
const rngAmt=document.getElementById('rngAmt'), rngVal=document.getElementById('rngVal');
const btnRun=document.getElementById('btnRun'), btnStep=document.getElementById('btnStep');
const seedInput=document.getElementById('seed'), btnReseed=document.getElementById('btnReseed');
const presetSel=document.getElementById('preset'), btnApplyPreset=document.getElementById('btnApplyPreset');
const toggleProtector=document.getElementById('toggleProtector');
const allyPressure=document.getElementById('allyPressure');
const testMode=document.getElementById('testMode'), debugOverlay=document.getElementById('debugOverlay');

speed.addEventListener('input',()=>{ speedVal.textContent=speed.value; BALANCE.tick.ms=+speed.value; });
rngAmt.addEventListener('input',()=>{ rngVal.textContent=rngAmt.value; state.randomness=(+rngAmt.value)/100; });
btnRun.addEventListener('click',()=>{ state.running=!state.running; btnRun.textContent=state.running?'⏸️ Pause':'▶️ Start'; });
btnStep.addEventListener('click',()=>{ tick(); draw(); });
btnReseed.addEventListener('click',()=>{ reseed(seedInput.value); state.tick=0; logEvent('🔁 Reseeded RNG.', seedInput.value); });
btnApplyPreset.addEventListener('click',()=>{ applyPreset(presetSel.value); });
testMode.addEventListener('change',()=>{ state.showTest=testMode.checked; debugOverlay.hidden=!state.showTest; });
toggleProtector.addEventListener('change',()=>{ BALANCE.diplomacy.guarantee=toggleProtector.checked; });

document.addEventListener('keydown',(e)=>{
  if(e.code==='Space'){ e.preventDefault(); btnRun.click(); }
  if(e.key==='n'||e.key==='N'){ e.preventDefault(); btnStep.click(); }
  if(e.key==='t'||e.key==='T'){ e.preventDefault(); testMode.checked=!testMode.checked; testMode.dispatchEvent(new Event('change')); }
});

/* ------------------------------ Sliders bind ----------------------------- */
const civSel=document.getElementById('selCiv'), selCivName=document.getElementById('selCivName');
const bindings=[
  ['religiousUnity','pillars.religion'],
  ['tolerance','pillars.tolerance'],
  ['churchState','pillars.churchState'],
  ['centralization','pillars.centralization'],
  ['ruleOfLaw','pillars.government'],
  ['taxCapacity','sec.taxCapacity'],
  ['agri','sec.agri'],
  ['industry','sec.industry'],
  ['tradeOpen','sec.tradeOpen'],
  ['resourceEndow','sec.resources'],
  ['literacy','pillars.knowledge'],
  ['media','pillars.media'],
  ['universities','pillars.knowledge'],
  ['patronage','pillars.culture'],
  ['culturalPrestige','pillars.culture'],
  ['rigidity','pillars.rigidity'],
  ['inequality','pillars.inequality'],
  ['cohesion','pillars.cohesion'],
  ['population','sec.pop'],
  ['urban','sec.urban'],
  ['infra','sec.infra'],
  ['health','sec.health'],
  ['military','sec.military'],
  ['aggression','sec.aggression'],
  ['diplomacy','sec.diplomacy'],
  ['pressure','externalPressure'],
  ['eventIntensity','randomEventIntensity']
];
const sliderEls={};
for(const [id] of bindings){ sliderEls[id]=document.getElementById(id); sliderEls['val_'+id]=document.getElementById('val_'+id); }
civSel.addEventListener('change',()=>populateSliders(getCiv(civSel.value)));
function getPathValue(obj,path){ const p=path.split('.'); let v=obj; for(const k of p) v=v[k]; return v; }
function setPathValue(obj,path,val){ const p=path.split('.'); let v=obj; for(let i=0;i<p.length-1;i++) v=v[p[i]]; v[p[p.length-1]]=val; }
function populateSliders(civ){
  selCivName.textContent=civ.name;
  civ.sec.taxCapacity ??= 50; civ.sec.agri ??= civ.pillars.economy; civ.sec.industry ??= civ.pillars.economy;
  for(const [id,path] of bindings){
    const el=sliderEls[id], badge=sliderEls['val_'+id];
    const val=Math.round(getPathValue(civ,path));
    if(el){ el.value=val; if(badge) badge.textContent=String(val); }
  }
}
for(const [id,path] of bindings){
  const el=sliderEls[id]; if(!el) continue;
  el.addEventListener('input',()=>{ const civ=getCiv(civSel.value); setPathValue(civ,path,+el.value); sliderEls['val_'+id].textContent=el.value; });
}

/* ----------------------------- Save / Load ------------------------------- */
const btnSave=document.getElementById('btnSave'), fileLoad=document.getElementById('fileLoad');
btnSave.addEventListener('click',()=>{
  const data={version:1,preset:state.preset,seed:_seed,tick:state.tick,civs:state.civs,relations:state.relations,
    map:{w:map.w,h:map.h,hexes:map.hexes.map(h=>({id:h.id,q:h.q,r:h.r,type:h.type,owner:h.owner,resource:h.resource,capital:h.capital,strait:h.strait}))},
    modifier:state.modifiers, routes:null, options:{protector:BALANCE.diplomacy.guarantee, allyPressure:+allyPressure.value}};
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=`sim-save-${Date.now()}.json`; a.click();
});
fileLoad.addEventListener('change', async e=>{
  const f=e.target.files[0]; if(!f) return; const text=await f.text(); const data=JSON.parse(text);
  state.preset=data.preset||'tess'; state.civs=data.civs; state.relations=data.relations||{}; state.tick=data.tick||0;
  reseed(String(data.seed||'719-SUNDER'));
  map.w=data.map.w; map.h=data.map.h; map.hexes=data.map.hexes;
  // rebuild neighbors/sets
  map.neighbors.clear();
  for(const h of map.hexes){
    const list=[]; for(let i=0;i<6;i++){ const [nq,nr]=neighborCoords(h.q,h.r,i); if(nq>=0&&nr>=0&&nq<map.w&&nr<map.h) list.push(nq+nr*map.w); }
    map.neighbors.set(h.id,list);
  }
  map.seaStraits.clear(); for(const h of map.hexes){ if(h.strait) map.seaStraits.add(h.id); }
  map.resourceHexes=map.hexes.filter(h=>h.resource).map(h=>h.id);
  map.outerShoals.clear(); for(const h of map.hexes){ if(h.type==='shoals') map.outerShoals.add(h.id); }
  map.capitals.clear(); for(const h of map.hexes){ if(h.capital && h.owner) map.capitals.set(h.owner,h.id); }
  computeTradeRoutes(); renderIdentityCards(); rebuildCivSelection(); populateSliders(getCiv(civSel.value||state.civs[0].id));
  logEvent('✅ Save loaded.','State restored from JSON.');
});

/* -------------------------- Text Report export --------------------------- */
document.getElementById('btnExportTxt').addEventListener('click', exportTextReport);
function exportTextReport(){
  let s=`World Report — tick ${state.tick}\nPreset: ${state.preset}\n\n`;
  for(const c of state.civs){
    const res=[...ownedResources(c.id)].join(', ')||'—';
    s += `${c.id} ${c.name}\n  Prosperity ${c.prosperity.toFixed(1)}  Morale ${c.morale.toFixed(1)}  Innovation ${c.innovation.toFixed(1)}  SoftPower ${c.softPower.toFixed(1)}\n  Treasury ${c.treasury.toFixed(0)}  MilEff ${(effectiveArmy(c)*100).toFixed(0)}  Aggression ${c.sec.aggression.toFixed(0)}\n  Resources: ${res}\n\n`;
  }
  s+='Wars:\n'; for(const w of state.wars){ s+=`  ${w.a} vs ${w.b}\n`; }
  s+='\nLatest News:\n'+state.news+'\n';
  const blob=new Blob([s],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`world-report-t${state.tick}.txt`; a.click();
}

/* ----------------------------- Newsfeed ---------------------------------- */
const newsEl=document.getElementById('newsText'), btnCopyNews=document.getElementById('btnCopyNews');
btnCopyNews.addEventListener('click', async()=>{
  try{ await navigator.clipboard.writeText(state.news); toast('📋 Copied summary.'); }catch(e){ toast('⚠️ Clipboard blocked','Select text and copy.'); }
});
function renderWorldSummary(){
  const newsItems = [];
  
  // Economy & Wealth
  const richest=[...state.civs].sort((a,b)=>b.prosperity-a.prosperity)[0];
  const richest2=[...state.civs].sort((a,b)=>b.treasury-a.treasury)[0];
  if(richest&&richest2) newsItems.push({
    bullet: '💰',
    text: `<span class="news-highlight">${richest.id}</span> leads in prosperity, while <span class="news-highlight">${richest2.id}</span> holds the deepest coffers.`,
    type: 'economy'
  });
  
  // War Status
  if(state.wars.length){ 
    const w=state.wars[0]; 
    newsItems.push({
      bullet: '⚔️',
      text: `War rages between <span class="news-warning">${w.a}</span> and <span class="news-warning">${w.b}</span>; contested hexes flare as fronts shift.`,
      type: 'war'
    });
  } else {
    newsItems.push({
      bullet: '🕊️',
      text: `No open wars, though tensions simmer along key frontiers.`,
      type: 'peace'
    });
  }
  
  // Trade
  const topTrade=[...state.civs].sort((a,b)=>b.lastTrade-a.lastTrade)[0]; 
  if(topTrade) {
    const hasBlockades = state.routes.some(r=>r.blocked);
    newsItems.push({
      bullet: '🚢',
      text: `<span class="news-highlight">${topTrade.id}</span> moves the most cargo this tick as convoys thread the lanes${hasBlockades ? ', despite strait blockades.' : '.'}`,
      type: 'trade'
    });
  }
  
  // Colonization
  if(state.colonizations.length){ 
    const c=state.colonizations[0]; 
    newsItems.push({
      bullet: '🏝️',
      text: `<span class="news-success">${c.civId}</span> is settling new lands; pennants circle over the chosen shore.`,
      type: 'colonization'
    });
  }
  
  // Recent Events from News Feed
  if (state.newsEvents && state.newsEvents.length > 0) {
    // Add the most recent 3 significant events
    const recentEvents = state.newsEvents.slice(0, 3);
    for (const event of recentEvents) {
      newsItems.push({
        bullet: '📰',
        text: `${event.title}`,
        type: 'event'
      });
    }
  }
  
  // External Pressure
  const hiP=[...state.civs].sort((a,b)=>b.externalPressure-a.externalPressure)[0]; 
  if(hiP) {
    newsItems.push({
      bullet: '🌊',
      text: `External pressure bears heaviest on <span class="news-warning">${hiP.id}</span>, inviting allies if thresholds are crossed.`,
      type: 'pressure'
    });
  }
  
  // Innovation
  const mostInnovative=[...state.civs].sort((a,b)=>b.innovation-a.innovation)[0]; 
  if(mostInnovative) {
    newsItems.push({
      bullet: '🔬',
      text: `<span class="news-info">${mostInnovative.id}</span> leads in innovation, with scholars pushing the boundaries of knowledge.`,
      type: 'innovation'
    });
  }
  
  // Morale
  const highestMorale=[...state.civs].sort((a,b)=>b.morale-a.morale)[0]; 
  if(highestMorale) {
    newsItems.push({
      bullet: '💪',
      text: `<span class="news-success">${highestMorale.id}</span> enjoys the highest morale, with citizens united in purpose.`,
      type: 'morale'
    });
  }
  
  // Alliances
  const mostAlliances=state.alliances.length>0 ? state.alliances[0]?.a : null; 
  if(mostAlliances) {
    newsItems.push({
      bullet: '🤝',
      text: `<span class="news-info">${mostAlliances}</span> maintains the most diplomatic ties, weaving a web of alliances.`,
      type: 'diplomacy'
    });
  }
  
  // Blockades
  const blockadedRoutes=state.routes.filter(r=>r.blocked).length; 
  if(blockadedRoutes>0) {
    newsItems.push({
      bullet: '🚫',
      text: `<span class="news-warning">${blockadedRoutes} trade route${blockadedRoutes>1?'s are':' is'} currently blockaded</span>, disrupting commerce.`,
      type: 'blockade'
    });
  }
  
  // Trade Routes
  const totalRoutes=state.routes.length; 
  if(totalRoutes>0) {
    newsItems.push({
      bullet: '🛤️',
      text: `${totalRoutes} active trade route${totalRoutes>1?'s':' route'} crisscross the world, carrying vital resources.`,
      type: 'routes'
    });
  }
  
  // World Stats
  const avgProsperity=state.civs.reduce((a,c)=>a+c.prosperity,0)/state.civs.length; 
  newsItems.push({
    bullet: '📊',
    text: `World prosperity averages <span class="news-highlight">${Math.round(avgProsperity)}%</span>, with fortunes rising and falling.`,
    type: 'stats'
  });
  
  const avgMorale=state.civs.reduce((a,c)=>a+c.morale,0)/state.civs.length; 
  newsItems.push({
    bullet: '🌍',
    text: `Global morale stands at <span class="news-highlight">${Math.round(avgMorale)}%</span>, reflecting the world's collective spirit.`,
    type: 'stats'
  });
  
  // Render as bullet points
  const html = newsItems.slice(0, 12).map(item => 
    `<div class="news-item">
      <span class="news-bullet">${item.bullet}</span>
      <div class="news-text">${item.text}</div>
    </div>`
  ).join('');
  
  newsEl.innerHTML = html;
  
  // Keep the plain text version for copying
  const text = newsItems.slice(0, 12).map(item => item.text.replace(/<[^>]*>/g, '')).join(' ');
  state.news = text;
  
  return text;
}
window.renderWorldSummary=renderWorldSummary;

/* -------------------------- Drawing & Animations ------------------------- */
function shadeColor(hex,lum){ const c=parseInt(hex.slice(1),16); let r=Math.round(((c>>16)&255)*lum+20), g=Math.round(((c>>8)&255)*lum+20), b=Math.round((c&255)*lum+20); r=clamp(r,0,255); g=clamp(g,0,255); b=clamp(b,0,255); return `rgb(${r},${g},${b})`; }
function resourceCode(res){ return {Grain:'Gr', Ironwood:'Iw', 'Auric Salts':'Au', 'Sky‑Amber':'Sa'}[res]||'??'; }

function drawHex(cx,cy,r, fill, stroke){
  ctx.beginPath();
  for(let i=0;i<6;i++){
    const ang=Math.PI/180*(60*i - 30); const x=cx+r*Math.cos(ang), y=cy+r*Math.sin(ang);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath(); ctx.fillStyle=fill; ctx.fill(); ctx.strokeStyle=stroke; ctx.lineWidth=0.5; ctx.stroke();
}

function hexFillColor(h){
  if(h.type==='sea') return '#0a1624';
  if(h.type==='shoals') return '#0f1f2f';
  if(h.owner){ const c=getCiv(h.owner).color; return shadeColor(c,0.55); }
  return '#101a2b';
}

function drawFronts(){
  ctx.save(); const R=BALANCE.geography.hexRadius; ctx.lineWidth=2;
  for(const h of map.hexes){
    if(h.owner==null || h.type!=='land') continue;
    for(const nid of map.neighbors.get(h.id)){
      const nh=map.hexes[nid];
      if(nh.owner && nh.owner!==h.owner && inWar(h.owner,nh.owner)){
        const [x1,y1]=axialToPixel(h.q,h.r,R), [x2,y2]=axialToPixel(nh.q,nh.r,R);
        ctx.strokeStyle='rgba(255,110,110,0.7)'; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawRoutes(){
  ctx.save(); const R=BALANCE.geography.hexRadius;
  for(const route of state.routes){
    // path polyline
    let prev=null; ctx.beginPath();
    for(const id of route.via){
      const [x,y]=axialToPixel(map.hexes[id].q, map.hexes[id].r, R);
      if(!prev){ ctx.moveTo(x,y); prev=[x,y]; } else { ctx.lineTo(x,y); prev=[x,y]; }
    }
    ctx.strokeStyle = route.type==='sea' ? 'rgba(100,180,255,0.35)' : 'rgba(240,210,120,0.35)';
    ctx.lineWidth=1.6; ctx.stroke();

    // blockade badge
    if(route.blocked && route.blockadeAt!=null){
      const h=map.hexes[route.blockadeAt]; const [bx,by]=axialToPixel(h.q,h.r,R);
      ctx.fillStyle='#ff6e6e'; ctx.beginPath(); ctx.arc(bx,by, 3.5,0,Math.PI*2); ctx.fill();
      ctx.save(); ctx.translate(bx+4,by-6); ctx.scale(0.8,0.8); ctx.fillStyle='rgba(255,110,110,0.9)'; ctx.font='bold 12px system-ui'; ctx.fillText('blocked',0,0); ctx.restore();
    }

    // convoy dots
    const pts=route.via.map(id=>axialToPixel(map.hexes[id].q,map.hexes[id].r,R));
    const segLens=[], cum=[0]; for(let i=1;i<pts.length;i++){ const d=Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]); segLens.push(d); cum.push(cum[i-1]+d); }
    const total=cum[cum.length-1]||1;
    for(const dot of route.convoys){
      dot.t += BALANCE.tick.convoySpeed * (route.blocked?0.3:1); if(dot.t>1){ dot.t-=1; dot.raided=false; }
      const dist=dot.t*total; let idx=segLens.findIndex((len,i)=>cum[i+1]>dist); if(idx<0) idx=segLens.length-1;
      const segStart=cum[idx], segLen=segLens[idx]||1, segT=(dist-segStart)/segLen;
      const [x1,y1]=pts[idx], [x2,y2]=pts[idx+1]||pts[idx]; const x=lerp(x1,x2,segT), y=lerp(y1,y2,segT);
      ctx.fillStyle = route.type==='sea' ? (dot.raided?'#ff9e9e':'#a9d4ff') : (dot.raided?'#ffd49e':'#f2e2a4');
      ctx.beginPath(); ctx.arc(x,y,1.8,0,Math.PI*2); ctx.fill();
      if(dot.flash>0){ ctx.strokeStyle='rgba(255,110,110,'+dot.flash+')'; ctx.beginPath(); ctx.arc(x,y,4+2*dot.flash,0,Math.PI*2); ctx.stroke(); dot.flash=Math.max(0,dot.flash-0.08); }
    }
  }
  ctx.restore();
}

/* ------------------------------- Loop / Tick ----------------------------- */
let lastFrame=0, accumulator=0;
function loop(t){
  if(!lastFrame) lastFrame=t; const dt=t-lastFrame; state.fps=lerp(state.fps||60, 1000/dt, 0.1); lastFrame=t;
  if(state.running){ accumulator+=dt; while(accumulator>=BALANCE.tick.ms){ tick(); accumulator-=BALANCE.tick.ms; } }
  draw(); requestAnimationFrame(loop);
}

function updateTrade(){
  const perCiv=new Map(state.civs.map(c=>[c.id,0]));
  for(const route of state.routes){
    const th=throughputForRoute(route);
    perCiv.set(route.ownerA, (perCiv.get(route.ownerA)||0) + (route.blocked? th*0.2 : th));
  }
  for(const c of state.civs){ c.lastTrade=perCiv.get(c.id)||0; }
}

function tick(){
  state.tick++;

  if(BALANCE.diplomacy.guarantee && state.tick%20===0){ checkAlliesJoin(); }

  applyModifiers();
  runEvents();
  colonizationAI(); colonizationTick();
  battleTick();
  updateBlockades();
  updateTrade();
  recalcDerived();
  if(state.tick % BALANCE.tick.newsUpdateEvery === 0) renderWorldSummary();

  if(state.tick - state.lastRaidAt > BALANCE.trade.raiderStrikeEvery){
    const avgP = state.civs.reduce((a,c)=>a+c.externalPressure,0)/state.civs.length;
    const chance=avgP/100 * BALANCE.trade.pressureToRaid;
    if(rnd()<chance){ raiderStrike(); state.lastRaidAt=state.tick; }
  }
}

/* ------------------------------- Test Mode ------------------------------- */
document.getElementById('btnRunTest').addEventListener('click', runTestSequence);
function runTestSequence(){
  const a=state.civs[0]?.id, b=state.civs[1]?.id, c=state.civs[2]?.id;
  if(a&&b) setWar(a,b);
  const sea=state.routes.find(r=>r.type==='sea'); if(sea){ sea.blocked=true; sea.blockadeAt=sea.via[Math.floor(sea.via.length/2)]; }
  if(c){ const cand=[...map.colonizable][0]; if(cand!=null){ state.colonizations.push({civId:c,hexId:cand,progress:0,cost:BALANCE.military.colonizeCost}); map.colonizable.delete(cand); } }
  setTimeout(()=>{ if(a&&b) setPeace(a,b); }, 5000);
  toast('🧪 Test sequence started.','War → Trade Blockade → Colonization → Peace.');
}

/* ----------------------------- UI: HUD/News ------------------------------ */
function updateUI(){ updateHUD(); renderIdentityCards(); }

const newsBtn=document.getElementById('btnCopyNews');
function draw(){
  // Debug: check if map data exists
  if (!map || !map.hexes || map.hexes.length === 0) {
    console.error('Map data not initialized');
    // Draw a test pattern to verify canvas is working
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Arial';
    ctx.fillText('Map not loaded', 50, 50);
    return;
  }
  
  console.log('Drawing map with', map.hexes.length, 'hexes, canvas size:', canvas.width, 'x', canvas.height);
  
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const margin=30, R=BALANCE.geography.hexRadius;
  const totalW=Math.sqrt(3)*R*(map.w+0.5), totalH=R*1.5*(map.h+0.5);
  const scale=Math.min((map.sizePx.w-2*margin)/totalW, (map.sizePx.h-2*margin)/totalH);
  ctx.save(); ctx.translate(margin,margin); ctx.scale(scale,scale);

  // Hexes
  for(const h of map.hexes){
    const [x,y]=axialToPixel(h.q,h.r,R);
    drawHex(x,y,R, hexFillColor(h), '#101826');
    if(h.capital){ ctx.fillStyle='#ffd166'; ctx.font='bold 12px system-ui'; ctx.fillText('★',x-4,y+4); }
    if(h.resource && h.type==='land'){ ctx.fillStyle='#eaf2ff'; ctx.font='10px ui-monospace, monospace'; ctx.fillText(resourceCode(h.resource), x-6, y+4); }
    if(h.strait){ ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(x,y,R*0.5,0,Math.PI*2); ctx.stroke(); }
    if(map.outerShoals.has(h.id)){ ctx.fillStyle='rgba(255,110,110,0.5)'; ctx.font='10px ui-monospace, monospace'; ctx.fillText('⚑', x-3, y+4); }
  }

  drawFronts();
  drawRoutes();

  // Colonization halos
  for(const col of state.colonizations){
    const h=map.hexes[col.hexId]; const [x,y]=axialToPixel(h.q,h.r,R);
    const t=(col.progress/BALANCE.tick.colonizeTicks);
    ctx.strokeStyle=`rgba(174,230,122,${0.9-t*0.7})`; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(x,y, R*(0.6 + 0.4*Math.sin(state.tick/10)), 0, Math.PI*2); ctx.stroke();
  }

  // Battle flares
  for(const f of flareAnimations){
    const h=map.hexes[f.id]; const [x,y]=axialToPixel(h.q,h.r,R);
    const radius=R*(0.6 + f.t*1.2), alpha=1-f.t;
    ctx.strokeStyle = f.color ? f.color : `rgba(255,255,255,${alpha})`;
    ctx.beginPath(); ctx.arc(x,y, radius, 0, Math.PI*2); ctx.stroke(); f.t+=0.05;
  }
  flareAnimations=flareAnimations.filter(f=>f.t<1);

  // Map events
  if (state.mapEvents) {
    for (const event of state.mapEvents) {
      const age = state.tick - event.tick;
      if (age < 100) { // Show events for 100 ticks
        const alpha = Math.max(0.3, 1 - age / 100);
        const size = Math.max(8, 12 - age / 10);
        
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.font = `bold ${size}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Get event icon based on title
        let icon = '✦';
        if (event.title.includes('🔥')) icon = '🔥';
        else if (event.title.includes('⚔️')) icon = '⚔️';
        else if (event.title.includes('🌟')) icon = '🌟';
        else if (event.title.includes('🧭')) icon = '🧭';
        else if (event.title.includes('🏝️')) icon = '🏝️';
        else if (event.title.includes('🔎')) icon = '🔎';
        
        ctx.fillText(icon, event.x, event.y);
      }
    }
    // Clean up old events
    state.mapEvents = state.mapEvents.filter(event => (state.tick - event.tick) < 100);
  }

  ctx.restore();

  // Diagnostics overlay in Test Mode
  if(state.showTest){
    const topRoutes=[...state.routes].sort((a,b)=>throughputForRoute(b)-throughputForRoute(a)).slice(0,3).map(r=>`${routeName(r)} ~${throughputForRoute(r).toFixed(2)}`);
    const maxPowerDiff=(()=>{
      let best=0, pair='—';
      for(let i=0;i<state.civs.length;i++) for(let j=i+1;j<state.civs.length;j++){
        const A=state.civs[i], B=state.civs[j];
        const diff=Math.abs(effectiveArmy(A) - effectiveArmy(B));
        if(diff>best){ best=diff; pair=`${A.id}/${B.id}`; }
      }
      return `${pair} (${best.toFixed(2)})`;
    })();
    const warnings=[]; for(const c of state.civs){ if(c.morale<25) warnings.push(`${c.id} low morale`); if(c.prosperity<25) warnings.push(`${c.id} low prosperity`); }
    document.getElementById('diag').innerHTML=
      `<div>FPS: ${state.fps.toFixed(1)}</div>
       <div>Tick: ${state.tick}</div>
       <div>Events logged: ${logEl.children.length}</div>
       <div>Max power diff: ${maxPowerDiff}</div>
       <div>Top routes: ${topRoutes.join(' · ')||'—'}</div>
       <div>Warnings: ${warnings.join(', ')||'—'}</div>`;
  }
  updateHUD();
}
function routeName(r){
  const A=map.hexes[r.from].owner;
  const oh=map.hexes[r.to]; const B=oh ? (oh.resource||'Cap') : 'Cap';
  return `${A}→${B}`;
}

/* ----------------------------- News Panel Controls ---------------------------- */
const newsPanel = document.getElementById('newsPanel');
const btnExpandNews = document.getElementById('btnExpandNews');
const newsResizeHandle = document.getElementById('newsResizeHandle');

// Expand/collapse functionality
btnExpandNews.addEventListener('click', () => {
  newsPanel.classList.toggle('expanded');
  btnExpandNews.textContent = newsPanel.classList.contains('expanded') ? '⤢' : '⤢';
});

// Resize functionality
let isResizing = false;
let startY = 0;
let startHeight = 0;

newsResizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  startY = e.clientY;
  startHeight = newsPanel.offsetHeight;
  document.body.style.cursor = 'ns-resize';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  
  const deltaY = e.clientY - startY;
  const newHeight = Math.max(200, Math.min(600, startHeight + deltaY));
  newsPanel.style.maxHeight = newHeight + 'px';
  
  // If we're resizing, make sure it's not in expanded mode
  if (newsPanel.classList.contains('expanded')) {
    newsPanel.classList.remove('expanded');
    btnExpandNews.textContent = '⤢';
  }
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    document.body.style.cursor = '';
  }
});

/* ----------------------------- Panel Resize Controls ---------------------------- */
const controlsResizeHandle = document.getElementById('controlsResizeHandle');
const hudResizeHandle = document.getElementById('hudResizeHandle');

// Panel resize functionality
let isPanelResizing = false;
let resizingPanel = null;
let startX = 0;
let startWidth = 0;

function startPanelResize(panel, handle, e) {
  isPanelResizing = true;
  resizingPanel = panel;
  startX = e.clientX;
  startWidth = panel.offsetWidth;
  document.body.style.cursor = 'ew-resize';
  e.preventDefault();
}

function handlePanelResize(e) {
  if (!isPanelResizing || !resizingPanel) return;
  
  const deltaX = e.clientX - startX;
  let newWidth;
  
  if (resizingPanel.classList.contains('controls')) {
    // Left panel - resize from right edge
    newWidth = Math.max(200, Math.min(600, startWidth + deltaX));
    resizingPanel.style.width = newWidth + 'px';
    // Update grid template
    document.querySelector('.wrap').style.gridTemplateColumns = `${newWidth}px 1fr 360px`;
  } else if (resizingPanel.classList.contains('hud')) {
    // Right panel - resize from left edge
    newWidth = Math.max(200, Math.min(600, startWidth - deltaX));
    resizingPanel.style.width = newWidth + 'px';
    // Update grid template
    const leftWidth = document.querySelector('.controls').offsetWidth;
    document.querySelector('.wrap').style.gridTemplateColumns = `${leftWidth}px 1fr ${newWidth}px`;
  }
}

function stopPanelResize() {
  if (isPanelResizing) {
    isPanelResizing = false;
    resizingPanel = null;
    document.body.style.cursor = '';
  }
}

// Add event listeners for panel resize handles
function setupPanelResizing() {
  const controlsResizeHandle = document.getElementById('controlsResizeHandle');
  const hudResizeHandle = document.getElementById('hudResizeHandle');
  
  if (controlsResizeHandle) {
    controlsResizeHandle.addEventListener('mousedown', (e) => {
      startPanelResize(document.querySelector('.controls'), controlsResizeHandle, e);
    });
  }
  
  if (hudResizeHandle) {
    hudResizeHandle.addEventListener('mousedown', (e) => {
      startPanelResize(document.querySelector('.hud'), hudResizeHandle, e);
    });
  }
  
  document.addEventListener('mousemove', handlePanelResize);
  document.addEventListener('mouseup', stopPanelResize);
}

// Setup panel resizing when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupPanelResizing);
} else {
  setupPanelResizing();
}

/* ----------------------------- Initialization ---------------------------- */
const idCards=document.getElementById('idCards');
function rebuildCivSelection(){ civSel.innerHTML=''; for(const c of state.civs){ const o=document.createElement('option'); o.value=c.id; o.textContent=`${c.id} — ${c.name}`; civSel.appendChild(o); } }

function applyPreset(p){
  state.preset=p; generateMap(p); state.civs=makePresetCivs(p); placeCivs(state.civs,p);
  computeTradeRoutes(); renderIdentityCards(); rebuildCivSelection();
  civSel.value=state.civs[0].id; populateSliders(state.civs[0]); renderWorldSummary();
  document.getElementById('toggleProtector').checked=BALANCE.diplomacy.guarantee;
  draw(); // Redraw the map to show the new preset
}

function start(){
  console.log('Starting simulation...');
  
  // Ensure canvas exists and is visible
  const canvas = document.getElementById('map');
  if (!canvas) {
    console.error('Canvas element not found!');
    return;
  }
  
  console.log('Canvas found, dimensions:', canvas.offsetWidth, 'x', canvas.offsetHeight);
  
  resizeCanvas(); 
  reseed(document.getElementById('seed').value);
  applyPreset('tess');
  state.running=true; 
  btnRun.textContent='⏸️ Pause';
  
  // Force a redraw after a short delay to ensure everything is loaded
  setTimeout(() => {
    draw();
    console.log('Map initialized with', map.hexes.length, 'hexes');
  }, 100);
}

// Wait for DOM to be ready before starting
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, starting simulation...');
    start(); 
    requestAnimationFrame(loop);
  });
} else {
  console.log('DOM already loaded, starting simulation...');
  start(); 
  requestAnimationFrame(loop);
}

/* ------------------------- END — Acceptance Checklist ----------------------
- [x] HTML with external CSS/JS, no external dependencies.
- [x] Five default civ identity cards with IDs/colors/religion/government/army-navy + defaults.
- [x] Pillar sliders (0–100) with tooltips + numeric badges; used in formulas.
- [x] Derived indices (Prosperity/Stability/Innovation/MilCapacity/SoftPower) shown in HUD & used in logic.
- [x] Trade routes drawn & animated; blockades & raids affect throughput.
- [x] War flips hexes with flare; colonization progress halo; raider events present.
- [x] Event engine with 16 sample events; toasts + log; timed effects expire.
- [x] Newsfeed (3–6 sentences) + Copy Summary.
- [x] Save/Load JSON; Export Text Report.
- [x] Test Mode overlay (FPS, events, power diff, top routes, warnings) + deterministic test sequence.
---------------------------------------------------------------------------- */
