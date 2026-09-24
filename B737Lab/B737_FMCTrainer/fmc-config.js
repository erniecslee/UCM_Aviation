/* 737-800 configuration data used by the AutoFlyingMule Lab flight model.
   FLAP_MANEUVER comes from the table you supplied (VREF40 + n, 737-600 to 737-900ER, all weights).
   The remaining values are typical figures, NOT taken from the FCOM: replace them here when you have the source. */
window.FMC_CONFIG={
  flapDetents:[0,1,5,10,15,25,30,40],
  flapManeuverOffset:{0:70,1:50,5:30,10:30,15:20,25:10,30:'REF30',40:0},     /* maneuvering speed = VREF40 + offset; flaps 30 = VREF30; flaps 40 = VREF40 */
  flapVFE:{0:340,1:250,5:250,10:210,15:200,25:190,30:175,40:162},          /* placard speeds (kt) — assumed */
  flapDragN1:{0:0,1:0.8,5:1.8,10:3.2,15:5.0,25:7.5,30:9.2,40:12.0},        /* N1-equivalent drag at 200 kt — assumed */
  gearDragN1:8, speedbrakeDragN1:5,
  flapRateDegPerSec:1.4, gearDownSec:8, gearUpSec:6,
  gearVLE:270,
  autobrakeDecel:{'1':4,'2':5,'3':7.5,'MAX':12},                            /* ft/s^2 — typical values, assumed */
  groundSpoilerDecel:2.5                                                    /* ft/s^2 added by spoilers after touchdown — assumed */
};
