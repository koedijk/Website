function isClaimable(status, until) {
  const now = Math.floor(Date.now() / 1000);

  const isTraveling =
    status?.startsWith('Travel to') ||
    status?.startsWith('Return from');

  const isHospitalShort =
    status === 'Hospital' &&
    until &&
    until - now < 300;

  return status === 'Okay' || isTraveling || isHospitalShort;
}

module.exports = { isClaimable };
