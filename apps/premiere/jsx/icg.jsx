/*
 * ICG ExtendScript bridge for Premiere Pro. ES3 only: ExtendScript has no const/let, arrow
 * functions, JSON, Array.prototype.indexOf or Object.keys. Every entry point returns a JSON
 * string shaped {ok:true,result} or {ok:false,error:{code,message}}; the panel parses it with zod.
 */

if (typeof JSON !== "object" || JSON === null) {
  JSON = {};
}

function icgQuote(s) {
  var out = '"';
  var i;
  var c;
  var code;
  for (i = 0; i < s.length; i++) {
    c = s.charAt(i);
    code = s.charCodeAt(i);
    if (c === '"') {
      out += '\\"';
    } else if (c === "\\") {
      out += "\\\\";
    } else if (c === "\n") {
      out += "\\n";
    } else if (c === "\r") {
      out += "\\r";
    } else if (c === "\t") {
      out += "\\t";
    } else if (code < 32) {
      out += "\\u" + ("000" + code.toString(16)).slice(-4);
    } else {
      out += c;
    }
  }
  return out + '"';
}

function icgStringify(v) {
  var t = typeof v;
  var parts;
  var i;
  var k;
  if (v === null || v === undefined) {
    return "null";
  }
  if (t === "number") {
    return isFinite(v) ? String(v) : "null";
  }
  if (t === "boolean") {
    return v ? "true" : "false";
  }
  if (t === "string") {
    return icgQuote(v);
  }
  if (t === "object") {
    if (v instanceof Array) {
      parts = [];
      for (i = 0; i < v.length; i++) {
        parts.push(icgStringify(v[i]));
      }
      return "[" + parts.join(",") + "]";
    }
    parts = [];
    for (k in v) {
      if (v.hasOwnProperty(k) && typeof v[k] !== "function" && typeof v[k] !== "undefined") {
        parts.push(icgQuote(k) + ":" + icgStringify(v[k]));
      }
    }
    return "{" + parts.join(",") + "}";
  }
  return "null";
}

function icgParse(text) {
  var t = String(text);
  var stripped = t
    .replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, "@")
    .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]")
    .replace(/(?:^|:|,)(?:\s*\[)+/g, "");
  if (/^[\],:{}\s]*$/.test(stripped)) {
    return eval("(" + t + ")");
  }
  throw new Error("Invalid JSON");
}

if (typeof JSON.stringify !== "function") {
  JSON.stringify = icgStringify;
}
if (typeof JSON.parse !== "function") {
  JSON.parse = icgParse;
}

var ICG = (function () {
  var TICKS_PER_SECOND = 254016000000;
  var MEDIATYPE_VIDEO = 1;

  function err(code, message) {
    return { icgCode: code, message: String(message) };
  }

  function describe(e) {
    var msg = e && e.message ? e.message : String(e);
    if (e && e.line && !e.icgCode) {
      msg += " (icg.jsx line " + e.line + ")";
    }
    return msg;
  }

  function run(fn) {
    try {
      return JSON.stringify({ ok: true, result: fn() });
    } catch (e) {
      return JSON.stringify({
        ok: false,
        error: { code: e && e.icgCode ? e.icgCode : "exception", message: describe(e) },
      });
    }
  }

  function activeSequence() {
    var seq = app.project ? app.project.activeSequence : null;
    return seq ? seq : null;
  }

  function timebaseTicks(seq) {
    var tb = parseFloat(seq.timebase);
    return tb > 0 ? tb : 0;
  }

  function frameRateOf(seq) {
    var tb = timebaseTicks(seq);
    var settings;
    var frameSeconds;
    if (tb > 0) {
      return Math.round((TICKS_PER_SECOND / tb) * 1000) / 1000;
    }
    try {
      settings = seq.getSettings();
      frameSeconds = settings && settings.videoFrameRate ? settings.videoFrameRate.seconds : 0;
      if (frameSeconds > 0) {
        return Math.round((1 / frameSeconds) * 1000) / 1000;
      }
    } catch (e) {
      /* fall through */
    }
    return 0;
  }

  function sequenceInfo(seq) {
    var width = seq.frameSizeHorizontal;
    var height = seq.frameSizeVertical;
    var settings;
    if (!(width > 0 && height > 0)) {
      settings = seq.getSettings();
      width = settings.videoFrameWidth;
      height = settings.videoFrameHeight;
    }
    return { name: String(seq.name), width: width, height: height, frameRate: frameRateOf(seq) };
  }

  function clipRanges(track) {
    var out = [];
    var i;
    var clip;
    for (i = 0; i < track.clips.numItems; i++) {
      clip = track.clips[i];
      out.push({ startSeconds: clip.start.seconds, endSeconds: clip.end.seconds });
    }
    return out;
  }

  function timeline(seq) {
    var tracks = [];
    var i;
    var track;
    for (i = 0; i < seq.videoTracks.numTracks; i++) {
      track = seq.videoTracks[i];
      tracks.push({ index: i, name: String(track.name), clips: clipRanges(track) });
    }
    return { playheadSeconds: seq.getPlayerPosition().seconds, tracks: tracks };
  }

  function trackFree(track, startSeconds, endSeconds) {
    var i;
    var clip;
    for (i = 0; i < track.clips.numItems; i++) {
      clip = track.clips[i];
      if (clip.start.seconds < endSeconds && startSeconds < clip.end.seconds) {
        return false;
      }
    }
    return true;
  }

  function normalizePath(p) {
    return String(p).replace(/\\/g, "/").toLowerCase();
  }

  function findItemByPath(bin, wanted) {
    var found = null;
    var i;
    var child;
    var mediaPath;
    for (i = 0; i < bin.children.numItems; i++) {
      child = bin.children[i];
      if (child.type === ProjectItemType.BIN) {
        found = findItemByPath(child, wanted) || found;
      } else {
        try {
          mediaPath = child.getMediaPath();
        } catch (e) {
          mediaPath = "";
        }
        if (mediaPath && normalizePath(mediaPath) === wanted) {
          found = child;
        }
      }
    }
    return found;
  }

  function importFile(path, label) {
    var bin = app.project.getInsertionBin();
    var ok;
    var item;
    if (!bin) {
      bin = app.project.rootItem;
    }
    ok = app.project.importFiles([path], true, bin, false);
    item = findItemByPath(app.project.rootItem, normalizePath(path));
    if (!item) {
      throw err(
        "import-failed",
        "importFiles returned " + ok + " but " + path + " is not in the project",
      );
    }
    try {
      item.name = label;
    } catch (e) {
      /* name is cosmetic */
    }
    return item;
  }

  function clipKey(clip) {
    var id = null;
    try {
      id = clip.nodeId;
    } catch (e) {
      id = null;
    }
    return id ? String(id) : clip.start.ticks + "|" + clip.end.ticks + "|" + clip.name;
  }

  function clipKeys(track) {
    var keys = [];
    var i;
    for (i = 0; i < track.clips.numItems; i++) {
      keys.push(clipKey(track.clips[i]));
    }
    return keys;
  }

  function contains(list, value) {
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] === value) {
        return true;
      }
    }
    return false;
  }

  function newClips(track, keysBefore) {
    var out = [];
    var i;
    var clip;
    for (i = 0; i < track.clips.numItems; i++) {
      clip = track.clips[i];
      if (!contains(keysBefore, clipKey(clip))) {
        out.push(clip);
      }
    }
    return out;
  }

  function nearTicks(a, b, tolerance) {
    return Math.abs(parseFloat(a) - parseFloat(b)) <= tolerance;
  }

  function overwriteAt(track, item, time, tolerance) {
    var forms = [
      { name: "seconds", value: time.seconds },
      { name: "ticks", value: time.ticks },
      { name: "time", value: time },
    ];
    var errors = [];
    var i;
    var j;
    var keysBefore;
    var added;
    var placed;
    for (i = 0; i < forms.length; i++) {
      keysBefore = clipKeys(track);
      try {
        track.overwriteClip(item, forms[i].value);
      } catch (e) {
        errors.push(forms[i].name + ": " + describe(e));
        continue;
      }
      added = newClips(track, keysBefore);
      placed = null;
      for (j = 0; j < added.length; j++) {
        if (nearTicks(added[j].start.ticks, time.ticks, tolerance)) {
          placed = added[j];
        }
      }
      if (placed) {
        return { clip: placed, form: forms[i].name };
      }
      for (j = 0; j < added.length; j++) {
        try {
          added[j].remove(false, false);
        } catch (e) {
          /* best effort cleanup of a misplaced clip */
        }
      }
      errors.push(
        forms[i].name +
          ": " +
          (added.length ? "clip landed at the wrong time" : "no clip appeared"),
      );
    }
    throw err("overwrite-failed", errors.join("; "));
  }

  function setClipEnd(clip, startTicks, durationSeconds, tb, steps) {
    var frames = tb > 0 ? Math.round(durationSeconds / (tb / TICKS_PER_SECOND)) : 0;
    var endTicks =
      tb > 0
        ? startTicks + frames * tb
        : startTicks + Math.round(durationSeconds * TICKS_PER_SECOND);
    var endTime = new Time();
    endTime.ticks = String(endTicks);
    try {
      clip.end = endTime;
      steps.push("end set to " + clip.end.seconds + "s");
    } catch (e) {
      steps.push("setting end failed: " + describe(e));
    }
    return clip.end.seconds;
  }

  function placedDuration(item, fallbackSeconds) {
    var inPoint;
    var outPoint;
    try {
      inPoint = item.getInPoint(MEDIATYPE_VIDEO).seconds;
      outPoint = item.getOutPoint(MEDIATYPE_VIDEO).seconds;
      if (outPoint > inPoint) {
        return outPoint - inPoint;
      }
    } catch (e) {
      /* older versions lack typed in/out getters */
    }
    return fallbackSeconds;
  }

  return {
    ping: function () {
      return run(function () {
        var hasQe = false;
        try {
          app.enableQE();
          hasQe = typeof qe === "object" && qe !== null && !!qe.project;
        } catch (e) {
          hasQe = false;
        }
        return { version: String(app.version), qe: hasQe };
      });
    },

    getSequenceInfo: function () {
      return run(function () {
        var seq = activeSequence();
        return seq ? sequenceInfo(seq) : null;
      });
    },

    getTimeline: function () {
      return run(function () {
        var seq = activeSequence();
        return seq ? timeline(seq) : null;
      });
    },

    addVideoTrack: function () {
      return run(function () {
        var seq = activeSequence();
        var before;
        var qeSeq;
        var errors = [];
        if (!seq) {
          throw err("no-sequence", "No active sequence");
        }
        before = seq.videoTracks.numTracks;
        app.enableQE();
        qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) {
          throw err("qe-unavailable", "qe.project.getActiveSequence() returned nothing");
        }
        try {
          qeSeq.addTracks(1, before, 0, 1, seq.audioTracks.numTracks, 0, 0);
        } catch (e) {
          errors.push("addTracks/7: " + describe(e));
        }
        if (app.project.activeSequence.videoTracks.numTracks > before) {
          return {
            method: "addTracks/7",
            numVideoTracks: app.project.activeSequence.videoTracks.numTracks,
          };
        }
        try {
          qeSeq.addTracks(1);
        } catch (e) {
          errors.push("addTracks/1: " + describe(e));
        }
        if (app.project.activeSequence.videoTracks.numTracks > before) {
          return {
            method: "addTracks/1",
            numVideoTracks: app.project.activeSequence.videoTracks.numTracks,
          };
        }
        throw err(
          "add-track-failed",
          errors.length ? errors.join("; ") : "track count did not change",
        );
      });
    },

    insert: function (argsJson) {
      return run(function () {
        var args = JSON.parse(argsJson);
        var steps = [];
        var seq = activeSequence();
        var track;
        var start;
        var startTicks;
        var tb;
        var tolerance;
        var endSeconds;
        var item;
        var placed;
        var result;
        var finalEnd;
        if (!seq) {
          throw err("no-sequence", "No active sequence");
        }
        track = seq.videoTracks[args.trackIndex];
        if (!track) {
          throw err("no-track", "Video track " + args.trackIndex + " does not exist");
        }
        start = seq.getPlayerPosition();
        startTicks = parseFloat(start.ticks);
        tb = timebaseTicks(seq);
        tolerance = tb > 0 ? tb : TICKS_PER_SECOND / 100;
        endSeconds = start.seconds + args.durationSeconds;
        if (!trackFree(track, start.seconds, endSeconds)) {
          throw err("track-occupied", "V" + (args.trackIndex + 1) + " is not free at the playhead");
        }
        item = importFile(args.path, args.label);
        steps.push("imported " + item.name);
        try {
          item.setOutPoint(args.durationSeconds, MEDIATYPE_VIDEO);
          steps.push("setOutPoint " + args.durationSeconds + "s");
        } catch (e) {
          steps.push("setOutPoint failed: " + describe(e));
        }
        try {
          item.setScaleToFrameSize();
          steps.push("setScaleToFrameSize");
        } catch (e) {
          steps.push("setScaleToFrameSize failed: " + describe(e));
        }
        placed = placedDuration(item, args.durationSeconds);
        if (
          placed > args.durationSeconds &&
          !trackFree(track, start.seconds, start.seconds + placed)
        ) {
          throw err(
            "track-occupied",
            "The still would be placed for " +
              placed +
              "s and V" +
              (args.trackIndex + 1) +
              " is not free for that long",
          );
        }
        result = overwriteAt(track, item, start, tolerance);
        steps.push("overwriteClip accepted " + result.form);
        finalEnd = setClipEnd(result.clip, startTicks, args.durationSeconds, tb, steps);
        try {
          result.clip.name = args.label;
        } catch (e) {
          /* name is cosmetic */
        }
        return {
          trackIndex: args.trackIndex,
          startSeconds: result.clip.start.seconds,
          endSeconds: finalEnd,
          overwriteForm: result.form,
          steps: steps,
        };
      });
    },
  };
})();
