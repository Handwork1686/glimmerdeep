#!/bin/bash
# name depth lvl seed warm frames
set -e
cd "$(dirname "$0")/../.."
node tools/qa/capture.mjs tr1_title title 0 1 0.2 240 1
node tools/qa/capture.mjs tr2_surface 0 2 101 0.3 420 1
node tools/qa/capture.mjs tr3_amber 170 3 102 2 360 1
node tools/qa/capture.mjs tr4_seal 293 4 31 0.8 420 1
node tools/qa/capture.mjs tr5_grotto 380 4 103 3 420 1
node tools/qa/capture.mjs tr6_ember 600 5 104 3 360 1
node tools/qa/capture.mjs tr7_hollow 860 6 106 3 360 1
node tools/qa/capture.mjs tr8_mantle 1150 7 107 3 420 1
node tools/qa/capture.mjs tr9_heart 1497 9 108 0.3 600 1
node tools/qa/capture.mjs tr10_ending scene:Ending 0 1 0.1 780 1
echo ALL_DONE
