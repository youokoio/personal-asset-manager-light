"use strict";

/* ---------- S14 グラフのズーム範囲 ---------- */

let chartZoomRange = null;

function resetChartZoom() {
  chartZoomRange = null;
}

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

function getChartPointTimestamp(dateString) {
  return getChartZoomTimestamp(dateString);
}

function getChartZoomMinimumSpan(points,fullRange) {
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

function getChartAxisRange(series,approximation = null) {
  const values = series.flatMap(item =>
    item.points.map(point => point.value)
  );

  if (approximation && approximation.available) {
    values.push(
      ...approximation.curve.map(point => point.value),
      ...approximation.forecastCurve.map(point => point.value)
    );
  }

  if (!values.length) return null;

  let minimum = Math.min(...values);
  let maximum = Math.max(...values);

  if (minimum > 0 && maximum > 0) {
    minimum = 0;
  } else if (minimum < 0 && maximum < 0) {
    maximum = 0;
  }

  if (minimum === maximum) {
    const padding = Math.abs(minimum) * 0.1 || 1;
    minimum -= padding;
    maximum += padding;
  } else {
    const padding = (maximum - minimum) * 0.08;
    minimum -= padding;
    maximum += padding;
  }

  return {minimum,maximum};
}

function createChartPointPath(points,xForDate,yForValue) {
  return points.map((point,index) => {
    const command = index === 0 ? "M" : "L";
    return command + " " +
      xForDate(point.date).toFixed(2) + " " +
      yForValue(point.value).toFixed(2);
  }).join(" ");
}

function getChartSeriesTimestampRange(series) {
  const timestamps = series.flatMap(item =>
    item.points.map(point => getChartPointTimestamp(point.date))
  ).filter(Number.isFinite);

  if (timestamps.length < 2) return null;

  return {
    start:Math.min(...timestamps),
    end:Math.max(...timestamps)
  };
}

function getChartSeriesDates(series) {
  return series.flatMap(item => item.points);
}

function setupChartPinchZoom(graph,series,fullRange) {
  if (!fullRange || fullRange.end <= fullRange.start) return;

  const minimumSpan = getChartZoomMinimumSpan(
    getChartSeriesDates(series),
    fullRange
  );

  let initialDistance = 0;
  let initialRange = null;
  let initialCenter = null;
  let pendingRange = null;
  let changed = false;

  function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getTouchCenterTimestamp(touches,range) {
    const rect = graph.getBoundingClientRect();
    const centerX = (touches[0].clientX + touches[1].clientX) / 2;
    const ratio = Math.min(
      1,
      Math.max(0,(centerX - rect.left) / Math.max(1,rect.width))
    );

    return range.start + (range.end - range.start) * ratio;
  }

  graph.addEventListener("touchstart",event => {
    if (event.touches.length !== 2) return;

    initialDistance = getTouchDistance(event.touches);
    initialRange = chartZoomRange
      ? {start:chartZoomRange.start,end:chartZoomRange.end}
      : {start:fullRange.start,end:fullRange.end};
    initialCenter = getTouchCenterTimestamp(
      event.touches,
      initialRange
    );
    pendingRange = null;
    changed = false;
  },{passive:true});

  graph.addEventListener("touchmove",event => {
    if (event.touches.length !== 2 || !initialRange) return;

    event.preventDefault();

    const distance = getTouchDistance(event.touches);
    if (initialDistance <= 0 || distance <= 0) return;

    const scale = distance / initialDistance;
    pendingRange = calculateChartZoomRange(
      initialRange,
      scale,
      initialCenter,
      fullRange,
      minimumSpan
    );
    changed = true;
  },{passive:false});

  function finishPinch() {
    if (changed && pendingRange) {
      const isFullRange =
        pendingRange.start <= fullRange.start &&
        pendingRange.end >= fullRange.end;

      chartZoomRange = isFullRange ? null : pendingRange;
      render();
    }

    initialDistance = 0;
    initialRange = null;
    initialCenter = null;
    pendingRange = null;
    changed = false;
  }

  graph.addEventListener("touchend",event => {
    if (event.touches.length < 2) finishPinch();
  },{passive:true});

  graph.addEventListener("touchcancel",finishPinch,{passive:true});
}
