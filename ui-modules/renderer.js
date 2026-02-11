// ui-modules/renderer.js — Canvas rendering (renderPreview)

  // -- Render --

  function renderPreview(canvas, text, fontData, colorHex, options) {
    var ctx = canvas.getContext('2d');
    if (!text || !fontData) {
      canvas.width = 1; canvas.height = 1;
      ctx.clearRect(0, 0, 1, 1);
      return { width: 0, height: 0, stitches: 0 };
    }

    var result = getTextBitmap(text, fontData);
    var bitmap = result.bitmap;
    var width = result.width;
    var height = result.height;
    if (!bitmap.length || !width) {
      canvas.width = 1; canvas.height = 1;
      ctx.clearRect(0, 0, 1, 1);
      return { width: 0, height: 0, stitches: 0 };
    }

    var opts = options || {};
    var maxCanvasWidth = opts.maxWidth || 850;
    var cellSize = opts.cellSize || 12;
    if (width * cellSize > maxCanvasWidth) {
      cellSize = Math.max(2, Math.floor(maxCanvasWidth / width));
    }

    var canvasW = width * cellSize + 1;
    var canvasH = height * cellSize + 1;
    canvas.width = canvasW;
    canvas.height = canvasH;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    var stitchCount = 0;

    // Filled cells
    ctx.fillStyle = colorHex;
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        if (bitmap[y][x]) {
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          stitchCount++;
        }
      }
    }

    // Grid lines
    ctx.strokeStyle = '#e0d8d0';
    ctx.lineWidth = 0.5;
    for (var gx = 0; gx <= width; gx++) {
      var px = gx * cellSize + 0.5;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, canvasH); ctx.stroke();
    }
    for (var gy = 0; gy <= height; gy++) {
      var py = gy * cellSize + 0.5;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(canvasW, py); ctx.stroke();
    }

    // Bold every 10
    if (cellSize >= 4) {
      ctx.strokeStyle = '#a09888';
      ctx.lineWidth = 1.5;
      for (var bx = 0; bx <= width; bx += 10) {
        var bpx = bx * cellSize + 0.5;
        ctx.beginPath(); ctx.moveTo(bpx, 0); ctx.lineTo(bpx, canvasH); ctx.stroke();
      }
      for (var by = 0; by <= height; by += 10) {
        var bpy = by * cellSize + 0.5;
        ctx.beginPath(); ctx.moveTo(0, bpy); ctx.lineTo(canvasW, bpy); ctx.stroke();
      }
    }

    return { width: width, height: height, stitches: stitchCount };
  }
