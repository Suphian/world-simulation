# 🌍 Alternate World Civilization & Geopolitics Simulator

**Scenario Default:** The Tesselated Sea, Year 719 After the Sundering (A.S.)

An experimental browser simulation where civilizations rise, trade, war, and collapse on an abstract hex map. All markup, styling, and logic live in a single `Simulation.html` so it can run directly in your browser without any build step or external assets.

## 🚀 Run
1. Download or clone this repository.
2. Open `Simulation.html` in any modern web browser.

## 📖 The World
- **The Tesselated Sea:** An inland sea shaped by peninsulas, straits, and archipelagos.
- **Outer Shoals:** Storm‑riven outer waters where raiders emerge.

### Civilizations (default)
- **SAL – The Salanic Empire** – iron‑fisted monarchy, pre-Sundering knowledge, strong legions.
- **LYR – Kingdom of Lyrica** – theocratic monarchy, religious unity, temple guard fleets.
- **THO – Republic of Thornwall** – merchant councils, pragmatic knowledge, seaborne trade.
- **KHA – Khaldur Nomad Clans** – tribal confederation, cavalry mastery, raiding.
- **GLA – Glass League** – merchant city‑states, convoy doctrine, knowledge guilds.

Each civ has six pillars plus secondary stats (population, infrastructure, health, military, diplomacy).

## 🪧 Pillars & Derived Indices

### Pillars
Religion, Government, Goods/Economy, Writing/Knowledge, Arts/Culture, and Social Structure define a civilization’s character. Adjust the sliders to see immediate effects.

### Derived Indices
- **Prosperity** – wealth & quality of life  
- **Stability/Morale** – social order & willingness to endure war  
- **Innovation** – rate of tech/cultural advance  
- **Soft Power** – diplomatic and cultural influence  
- **Military Effectiveness** – unified army/navy readiness  

## 😄 Trade System
- Animated sea and land convoys connect resource producers and consumers.
- Resources (Grain, Ironwood, Auric Salts, Sky‑Amber) grant specific multipliers.
- Blockades and raids visibly reduce throughput.

## ⚔️ War & Colonization
- Hexes flip during war based on relative power and morale.
- Prosperous powers can settle neutral hexes with animated progress halos.
- War exhaustion erodes morale over time.

## 🎲 Event Engine & Newsfeed
- Scripted and random events (Religious Schism, Golden Age, Naval Blockade, Colonial Uprising, Peace Conference, etc.) change stats and show toast/log entries.
- A dynamic world newsfeed reports wars, colonization, top trade movers, morale leaders, and crises.

## 💾 Save/Load & Test Mode
- Export JSON save files or plain-text world reports for analysis.
- Test mode toggles an overlay for FPS, event counts, trade route stats, and warnings with a deterministic “War → Blockade → Colonization → Peace” sequence.

## 🎮 How to Play
1. Open `Simulation.html` in a browser.
2. Pick a civ in the left panel.
3. Adjust pillars via the sliders — tooltips explain effects and preview “what-if” changes.
4. Press ▶ Start and watch borders, convoys, raids, and events unfold.
5. Follow the World Newsfeed for high-level summaries.
6. Export reports or JSON saves anytime.

Have fun exploring alternate histories! This was the README I liked.
