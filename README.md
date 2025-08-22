# 🌍 Alternate World Civilization & Geopolitics Simulator

**Scenario Default:** The Tesselated Sea, Year 719 After the Sundering (A.S.)

An experimental single-file HTML simulation where civilizations rise, trade, war, and collapse on an abstract hex map. Built with vanilla JS + Canvas, no dependencies.

## 📖 The World
- **The Tesselated Sea:** An inland sea shaped by peninsulas, straits, and archipelagos.
- **Outer Shoals:** Storm-ridden outer waters where raiders emerge.

### Civilizations (default)
- **SAL – The Salanic Empire** – iron-fisted monarchy, pre-Sundering knowledge, strong legions.
- **LYR – Kingdom of Lyrica** – theocratic monarchy, religious unity, temple guard fleets.
- **THO – Republic of Thornwall** – merchant councils, pragmatic knowledge, seaborne trade.
- **KHA – Khaldur Nomad Clans** – tribal confederation, cavalry mastery, raiding.
- **GLA – Glass League** – merchant city-states, convoy doctrine, knowledge guilds.

Each civ has Religion, Government, Economy, Knowledge, Arts, and Social Structure pillars plus secondary stats (population, infrastructure, health, army, navy, diplomacy).

## 🛠️ Functionality

### Sliders & Pillars
Six pillars define each civ: Religion, Government, Goods/Economy, Writing/Knowledge, Arts/Culture, Social Structure. Adjust sliders per civ to see immediate effects on Prosperity, Morale, Innovation, Soft Power, and Military strength.

### Derived Indices
- **Prosperity** – wealth & quality of life
- **Stability/Morale** – social order & willingness to endure war
- **Innovation** – rate of tech/cultural advance
- **Soft Power** – diplomatic and cultural influence
- **Army/Navy Effectiveness** – actual combat readiness

### Trade System
- Animated convoys (sea + land routes).
- Resources (Grain, Ironwood, Auric Salts, Sky-Amber) boost specific multipliers.
- Blockades and raids visibly reduce throughput.

### War & Colonization
- Hexes flip during war based on relative power and morale.
- Colonization: prosperous/naval powers can settle neutral hexes with animated progress halos.
- War exhaustion erodes morale over time.

### Event Engine
Scripted + random events (Religious Schism, Golden Age, Naval Blockade, Colonial Uprising, Peace Conference, etc.). Each event changes stats and shows a toast/log entry.

### Newsfeed
A dynamic world summary every few ticks: wars, colonization, top trade movers, morale leaders, and crises.

### Save/Load
Export JSON save files or plain-text world reports for analysis.

### Test Mode
Toggle overlay to show FPS, event counts, trade route stats, warnings (low morale/prosperity). Includes a deterministic “War → Blockade → Colonization → Peace” test sequence.

## 🎮 How to Play
1. Open `Simulation File v2.html` in a browser.
2. Pick a civ in the left panel.
3. Adjust sliders (Religion, Economy, etc.) — watch tooltips explain effects and preview “what-if” changes.
4. Press ▶ Start and watch borders, convoys, raids, and events unfold.
5. Follow the World Newsfeed for high-level summaries.
6. Export reports or JSON saves anytime.

Try presets:
- The Tesselated Sea (fantasy)
- Western Europe 1914 (WWI tensions)
- Bronze Age Collapse 1200 BCE (Sea Peoples invasions)

## 🚀 Development Notes
- Single file: No build tools, no external assets.
- `BALANCE` object: All formulas and weights centralized for easy tuning.
- Canvas rendering: Efficient redraw of hex grid, convoys, halos, and battle flares.
- Accessibility: Keyboard shortcuts (Space = Run/Pause, N = Step, T = Test Mode).
- Context Docs: See `/simulation/context/tess_sim_cursor_context.md` for full world bible and formulas.
- Patches: planned modular extensions will live under `/simulation/patches/`.

