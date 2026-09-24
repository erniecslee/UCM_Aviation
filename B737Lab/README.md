# B737 Lab

```
B737Lab/
  B737_FMCTrainer/            FMC / CDU trainer (index.html) and the shared FMC core
    fmc-core.js               FMC engine + CDU logic (shared by both apps)
    fmc-cdu.css               CDU panel styles (shared)
    fmc-magvar.js             World Magnetic Model 2025 -> magnetic variation (validated against NOAA test values)
    fmc-n1.js                 FCOM 737-800/CFM56-7B26 N1 tables: max climb, go-around, LRC control, level-flight N1 (PI.30.43-45, PI.31.2)
    fmc-config.js             flap / gear / autobrake data for the Lab (VREF40 maneuver table from you; the rest are typical values to verify)
    data/
      nav-core.js, nav-fixes.js, airports/    FAA CIFP 2609 (as before)
      nav-ils.js              ILS frequency / course / antenna data (803 airports, 1,237 ILS) from the same CIFP file
  AutoFlyingMule_Lab/         Automation simulator (MCP, EFIS, PFD, ND/VSD, thrust levers, NAV radios, FMC drawer)
    index.html, lab.css, js/  (geo, afds, vnav, ground, nav, fmcbridge, panels, config, displays, app), assets/ap-disengage.mp3
```

Open either `index.html` by double-clicking (no server needed) or host the whole `B737Lab` folder unchanged.
AutoFlyingMule_Lab reads the FMC core and all data from `../B737_FMCTrainer/`, so FMC logic is updated in one place.

Data sources: FAA CIFP cycle 2609 (effective 2026-09-03), NOAA/NCEI WMM2025 coefficients.
