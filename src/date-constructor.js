/**
 * Date Constructor — Stage 4 of the parsing pipeline.
 * Converts wall-clock time components in a source timezone to a UTC Date object.
 * Uses Intl.DateTimeFormat to compute offsets — no moment-timezone dependency.
 */

function constructDateInTimezone(year, month, day, hour, minute, second, ianaZone) {
    const roughUtc = new Date(Date.UTC(year, month, day, hour, minute, second));

    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: ianaZone,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hourCycle: 'h23'
    });

    const offsetMs = computeOffsetMs(formatter, roughUtc);
    const realUtc = new Date(roughUtc.getTime() - offsetMs);

    // Verify by round-tripping
    const verifyParts = formatter.formatToParts(realUtc);
    const vHour = parseInt(verifyParts.find(p => p.type === 'hour').value);
    const vMinute = parseInt(verifyParts.find(p => p.type === 'minute').value);
    const vDay = parseInt(verifyParts.find(p => p.type === 'day').value);

    // Determine whether the round-trip result needs correction:
    // - If vDay is wrong (not matching a cross-midnight scenario), recompute.
    // - If vHour is *less* than requested (clock went backwards — wrong offset direction), recompute.
    // - If vHour matches exactly but vMinute is off, recompute.
    // - If vHour > hour on the same day, the input fell in a DST spring-forward gap and the
    //   clock snapped forward naturally — this is the correct behavior, accept pass 1.
    const dayMismatch = vDay !== day;
    const hourBehind = !dayMismatch && vHour < hour;
    const minuteMismatch = !dayMismatch && vHour === hour && vMinute !== minute;

    if (dayMismatch || hourBehind || minuteMismatch) {
        const secondOffsetMs = computeOffsetMs(formatter, realUtc);
        return new Date(roughUtc.getTime() - secondOffsetMs);
    }

    return realUtc;
}

function computeOffsetMs(formatter, utcDate) {
    const parts = formatter.formatToParts(utcDate);
    const get = (type) => parseInt(parts.find(p => p.type === type).value);
    const tzWallMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return tzWallMs - utcDate.getTime();
}

module.exports = { constructDateInTimezone };
