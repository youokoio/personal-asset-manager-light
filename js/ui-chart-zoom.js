"use strict";

/* ---------- S14 グラフのズーム範囲 ---------- */

function getChartZoomTimestamp(dateString) {
  if (typeof dateString !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return null;
  }

  const parts = dateString.split("-").map(Number);
  const timestamp = Date.UTC(
    parts[0],
    parts[1] - 1,
    parts[2]
  );

  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== parts[0] ||
      date.getUTCMonth() !== parts[1] - 1 ||
      date.getUTCDate() !== parts[2]) {
    return null;
  }

  return timestamp;
}

function getChartZoomMinimumSpan(points, fullRange) {
  const fullSpan = fullRange.end - fullRange.start;

  if (!Number.isFinite(fullSpan) || fullSpan <= 0) {
    return 0;
  }

  const timestamps = points
    .map(point => typeof point === "number"
      ? point
      : getChartZoomTimestamp(point.date)
    )
    .filter(timestamp =>
      Number.isFinite(timestamp) &&
      timestamp >= fullRange.start &&
      timestamp <= fullRange.end
    )
    .sort((a,b) => a - b);

  let minimumSpan = Infinity;

  for (let index = 1; index < timestamps.length; index += 1) {
    const span = timestamps[index] - timestamps[index - 1];

    if (span > 0 && span < minimumSpan) {
      minimumSpan = span;
    }
  }

  if (!Number.isFinite(minimumSpan)) {
    minimumSpan = fullSpan / 20;
  }

  return Math.min(fullSpan,Math.max(1,minimumSpan));
}

function calculateChartZoomRange(
  currentRange,
  pinchScale,
  centerTimestamp,
  fullRange,
  minimumSpan
) {
  if (!currentRange ||
      !fullRange ||
      !Number.isFinite(currentRange.start) ||
      !Number.isFinite(currentRange.end) ||
      !Number.isFinite(fullRange.start) ||
      !Number.isFinite(fullRange.end) ||
      currentRange.end <= currentRange.start ||
      fullRange.end <= fullRange.start ||
      !Number.isFinite(pinchScale) ||
      pinchScale <= 0) {
    return currentRange
      ? {start:currentRange.start,end:currentRange.end}
      : null;
  }

  const fullSpan = fullRange.end - fullRange.start;
  const currentSpan = Math.min(
    fullSpan,
    Math.max(1,currentRange.end - currentRange.start)
  );
  const lowerSpan = Number.isFinite(minimumSpan) &&
    minimumSpan > 0
      ? Math.min(fullSpan,minimumSpan)
      : fullSpan / 20;
  const nextSpan = Math.min(
    fullSpan,
    Math.max(lowerSpan,currentSpan / pinchScale)
  );

  const center = Number.isFinite(centerTimestamp)
    ? Math.min(
        currentRange.end,
        Math.max(currentRange.start,centerTimestamp)
      )
    : (currentRange.start + currentRange.end) / 2;

  let start = center - nextSpan / 2;
  let end = center + nextSpan / 2;

  if (start < fullRange.start) {
    end += fullRange.start - start;
    start = fullRange.start;
  }

  if (end > fullRange.end) {
    start -= end - fullRange.end;
    end = fullRange.end;
  }

  start = Math.max(fullRange.start,start);
  end = Math.min(fullRange.end,end);

  return {start,end};
}
