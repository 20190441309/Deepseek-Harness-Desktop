const CONTROL_SIZE = 32;
const CONTROL_GAP = 0;
const EDGE = 8;
const CLUSTER = 8;

function dshWindowControlsRight() {
  return EDGE + CONTROL_SIZE * 3 + CONTROL_GAP * 2 + CLUSTER;
}

function dshReservedRight(trailingWidth) {
  const controls = dshWindowControlsRight();
  const width = Math.max(0, Math.round(Number(trailingWidth) || 0));
  return width > 0 ? controls + width + CLUSTER : controls;
}

module.exports = { dshWindowControlsRight, dshReservedRight };
