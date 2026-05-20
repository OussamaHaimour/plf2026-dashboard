// ═══════════════════════════════════════════════════════════
//  PLF 2026 — Dashboard D3.js — app.js
// ═══════════════════════════════════════════════════════════

const tooltip = d3.select('#tooltip');
const fmt = d3.format(',.2f');

function showTip(evt, html) {
  tooltip.html(html).classed('visible', true)
    .style('left', (evt.clientX + 14) + 'px')
    .style('top', (evt.clientY - 10) + 'px');
}
function hideTip() { tooltip.classed('visible', false); }

// Helper to determine text contrast color based on background luminance
function getContrastColor(colorStr) {
  const c = d3.rgb(colorStr);
  const luminance = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return luminance > 0.65 ? '#0F2850' : '#FFFFFF';
}

// ═══════════════════════════════════════════════════════════
//  1. SANKEY
// ═══════════════════════════════════════════════════════════
function buildSankey() {
  const el = document.getElementById('chart-sankey');
  const W = 1400;
  const H = 1100;

  // Build nodes & links
  const nodes = [];
  const links = [];
  const recTotal = DATA.recettes.reduce((s, r) => s + r.value, 0);
  const depTotal = DATA.depenses.reduce((s, d) => s + d.value, 0);
  const emprunts = Math.round((depTotal - recTotal) * 100) / 100;

  // Recettes nodes (0..7)
  DATA.recettes.forEach(r => nodes.push({ name: r.name, type: 'recette' }));
  // Emprunts node (8)
  nodes.push({ name: 'Emprunts & Financement', type: 'emprunt' });
  // Budget node (9)
  const budgetIdx = nodes.length;
  nodes.push({ name: "Dépenses du Budget Général", type: 'budget' });
  // Depenses nodes (10..49)
  const depStart = nodes.length;
  DATA.depenses.forEach(d => nodes.push({ name: d.name, type: d.name.includes('Dette') ? 'dette' : 'depense' }));

  // Links: recettes -> budget
  DATA.recettes.forEach((r, i) => links.push({ source: i, target: budgetIdx, value: r.value }));
  // Link: emprunts -> budget
  links.push({ source: DATA.recettes.length, target: budgetIdx, value: emprunts });
  // Links: budget -> depenses
  DATA.depenses.forEach((d, i) => links.push({ source: budgetIdx, target: depStart + i, value: d.value }));

  const colorMap = { recette: '#22c55e', emprunt: '#f97316', budget: '#d4a74a', dette: '#ef4444' };
  const bluePal = ['#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#0ea5e9', '#d946ef', '#06b6d4', '#f59e0b', '#6366f1'];

  function nodeColor(d) {
    if (colorMap[d.type]) return colorMap[d.type];
    return bluePal[d.index % bluePal.length];
  }
  function linkColor(d) {
    const src = d.source;
    if (src.type === 'emprunt') return 'rgba(249,115,22,0.4)';
    if (src.type === 'recette') return 'rgba(34,197,94,0.35)';
    const tgt = d.target;
    if (tgt.type === 'dette') return 'rgba(239,68,68,0.4)';
    const hex = bluePal[tgt.index % bluePal.length].replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.substr(i, 2), 16));
    return `rgba(${r},${g},${b},0.3)`;
  }

  const svg = d3.select('#chart-sankey').append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  // Augmenter les marges gauche/droite à 250px pour laisser toute la place aux étiquettes sans rognage
  const sankey = d3.sankey()
    .nodeId(d => d.index)
    .nodeWidth(22)
    .nodePadding(8)
    .nodeAlign(d3.sankeyJustify)
    .extent([[250, 30], [W - 250, H - 20]]);

  const graph = sankey({
    nodes: nodes.map((d, i) => ({ ...d, index: i })),
    links: links.map(d => ({ ...d }))
  });

  // Links
  svg.append('g').selectAll('path')
    .data(graph.links).join('path')
    .attr('class', 'sankey-link')
    .attr('d', d3.sankeyLinkHorizontal())
    .attr('stroke', d => linkColor(d))
    .attr('stroke-width', d => Math.max(1.5, d.width))
    .on('mouseover', (evt, d) => showTip(evt,
      `<div class="tt-title">${d.source.name} → ${d.target.name}</div><div class="tt-value">${fmt(d.value)} MMDH</div>`))
    .on('mousemove', (evt) => { tooltip.style('left', (evt.clientX + 14) + 'px').style('top', (evt.clientY - 10) + 'px'); })
    .on('mouseout', hideTip);

  // Nodes
  const node = svg.append('g').selectAll('g')
    .data(graph.nodes).join('g').attr('class', 'sankey-node');

  node.append('rect')
    .attr('x', d => d.x0).attr('y', d => d.y0)
    .attr('height', d => Math.max(1, d.y1 - d.y0))
    .attr('width', d => d.x1 - d.x0)
    .attr('fill', d => nodeColor(d))
    .on('mouseover', (evt, d) => showTip(evt,
      `<div class="tt-title">${d.name}</div><div class="tt-value">${fmt(d.value)} MMDH</div>`))
    .on('mousemove', (evt) => { tooltip.style('left', (evt.clientX + 14) + 'px').style('top', (evt.clientY - 10) + 'px'); })
    .on('mouseout', hideTip);

  // Labels — TOUS les nœuds auront un label visible, même les plus petits
  // On trie les nœuds par position Y pour détecter les chevauchements
  const sortedByY = (side) => [...graph.nodes]
    .filter(d => side === 'left' ? d.x0 < W / 2 && d.type !== 'budget' : d.x0 >= W / 2 && d.type !== 'budget')
    .sort((a, b) => a.y0 - b.y0);

  // Calculer les positions Y ajustées pour éviter le chevauchement
  function adjustLabelPositions(nodes, minGap) {
    const positions = [];
    nodes.forEach(d => {
      let idealY = (d.y0 + d.y1) / 2;
      // Vérifier si ça chevauche le label précédent
      if (positions.length > 0) {
        const lastY = positions[positions.length - 1];
        if (idealY - lastY < minGap) {
          idealY = lastY + minGap;
        }
      }
      positions.push(idealY);
      d._labelY = idealY;
    });
  }

  adjustLabelPositions(sortedByY('left'), 11);
  adjustLabelPositions(sortedByY('right'), 11);
  // Budget node
  graph.nodes.filter(d => d.type === 'budget').forEach(d => { d._labelY = d.y0 - 8; });

  node.append('text')
    .attr('x', d => {
      if (d.type === 'budget') return (d.x0 + d.x1) / 2;
      return d.x0 < W / 2 ? d.x0 - 8 : d.x1 + 8;
    })
    .attr('y', d => d._labelY || (d.y0 + d.y1) / 2)
    .attr('dy', d => d.type === 'budget' ? '0' : '0.35em')
    .attr('text-anchor', d => {
      if (d.type === 'budget') return 'middle';
      return d.x0 < W / 2 ? 'end' : 'start';
    })
    .text(d => {
      const maxLen = 35;
      const label = d.name.length > maxLen ? d.name.slice(0, maxLen - 1) + '…' : d.name;
      return `${label} (${fmt(d.value)})`;
    })
    .style('font-weight', d => d.type === 'budget' ? 'bold' : '600')
    .style('font-size', d => d.type === 'budget' ? '12px' : '10px');
}

// ═══════════════════════════════════════════════════════════
//  2 & 3. TREEMAPS
// ═══════════════════════════════════════════════════════════
function buildTreemap(containerId, rawData, colorInterp, threshold) {
  const el = document.getElementById(containerId);
  const W = el.clientWidth || 900;
  const H = 600;

  // Convert to per-100-DH and group small values
  const total = rawData.reduce((s, d) => s + d.value, 0);
  let items = rawData.map(d => ({ name: d.name, value: (d.value / total) * 100, raw: d.value }));
  let autresVal = 0;
  const kept = [];
  items.forEach(d => {
    if (d.value >= threshold) kept.push(d);
    else autresVal += d.value;
  });
  if (autresVal > 0) kept.push({ name: 'Autres secteurs', value: autresVal, raw: autresVal * total / 100 });
  kept.sort((a, b) => b.value - a.value);

  const root = d3.hierarchy({ name: 'root', children: kept }).sum(d => d.value).sort((a, b) => b.value - a.value);
  d3.treemap().size([W, H]).padding(3).round(true)(root);

  const maxVal = d3.max(kept, d => d.value);
  const color = d3.scaleSequential(colorInterp).domain([0, maxVal]);

  const svg = d3.select(`#${containerId}`).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const cell = svg.selectAll('g')
    .data(root.leaves()).join('g')
    .attr('class', 'treemap-cell')
    .attr('transform', d => `translate(${d.x0},${d.y0})`);

  cell.append('rect')
    .attr('width', d => d.x1 - d.x0)
    .attr('height', d => d.y1 - d.y0)
    .attr('fill', d => color(d.data.value))
    .on('mouseover', (evt, d) => showTip(evt,
      `<div class="tt-title">${d.data.name}</div><div class="tt-value">${d.data.value.toFixed(2)} DH / 100 DH</div><div>${fmt(d.data.raw)} MMDH</div>`))
    .on('mousemove', evt => { tooltip.style('left', (evt.clientX + 14) + 'px').style('top', (evt.clientY - 10) + 'px'); })
    .on('mouseout', hideTip);

  // Text labels with foreignObject for perfect wrapping, adaptive contrast, and auto-scaling
  cell.append('foreignObject')
    .attr('width', d => Math.max(0, d.x1 - d.x0))
    .attr('height', d => Math.max(0, d.y1 - d.y0))
    .style('pointer-events', 'none') // Allow hover events to pass to the rect underneath
    .append('xhtml:div')
    .style('width', '100%')
    .style('height', '100%')
    .style('box-sizing', 'border-box')
    .style('padding', '6px')
    .style('overflow', 'hidden')
    .style('display', 'flex')
    .style('flex-direction', 'column')
    .style('justify-content', 'flex-start')
    .html(d => {
      const w = d.x1 - d.x0;
      const h = d.y1 - d.y0;
      if (w < 45 || h < 24) return '';

      const bgColor = color(d.data.value);
      const txtColor = getContrastColor(bgColor);

      // Dynamic font sizing based on cell size
      const nameSize = Math.max(8.5, Math.min(12, w / 11));
      const valSize = Math.max(7.5, Math.min(10.5, w / 13));

      // Multiline truncation using webkit-line-clamp
      const nameHtml = `<div style="font-family: 'Inter', sans-serif; font-weight: 600; font-size: ${nameSize}px; color: ${txtColor}; line-height: 1.15; word-wrap: break-word; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${d.data.name}</div>`;
      const valHtml = h > 38 ? `<div style="font-family: 'Inter', sans-serif; font-size: ${valSize}px; color: ${txtColor}; opacity: 0.85; margin-top: 2px; font-weight: 500;">${d.data.value.toFixed(1)} DH</div>` : '';

      return nameHtml + valHtml;
    });
}

// ═══════════════════════════════════════════════════════════
//  4. MACRO BAR CHART
// ═══════════════════════════════════════════════════════════
function buildMacro() {
  const el = document.getElementById('chart-macro');
  const W = el.clientWidth || 800;
  const margin = { top: 30, right: 100, bottom: 40, left: 280 };
  const H = 300;
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top - margin.bottom;

  const data = [...DATA.macro].sort((a, b) => a.valeur - b.valeur);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.valeur) * 1.15]).range([0, iW]);
  const y = d3.scaleBand().domain(data.map(d => d.secteur)).range([0, iH]).padding(0.35);

  const barColors = ['#0d9488', '#0ea5e9', '#22c55e'];
  const svg = d3.select('#chart-macro').append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Grid lines
  g.append('g').attr('class', 'axis')
    .call(d3.axisBottom(x).ticks(5).tickSize(iH).tickFormat(d => d + '%'))
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('line').attr('stroke', '#e2e8f0').attr('stroke-dasharray', '4,3'))
    .call(g => g.selectAll('text').attr('dy', iH + 14));

  // Y axis
  g.append('g').attr('class', 'axis')
    .call(d3.axisLeft(y).tickSize(0).tickPadding(10))
    .call(g => g.select('.domain').remove());

  // Bars
  const bars = g.selectAll('.bar-group').data(data).join('g').attr('class', 'bar-group');

  bars.append('rect')
    .attr('x', 0).attr('y', d => y(d.secteur))
    .attr('height', y.bandwidth())
    .attr('width', 0)
    .attr('fill', (d, i) => barColors[i])
    .attr('rx', 6)
    .on('mouseover', (evt, d) => showTip(evt,
      `<div class="tt-title">${d.secteur}</div><div class="tt-value">+${d.valeur}%</div>`))
    .on('mousemove', evt => { tooltip.style('left', (evt.clientX + 14) + 'px').style('top', (evt.clientY - 10) + 'px'); })
    .on('mouseout', hideTip)
    .transition().duration(800).ease(d3.easeCubicOut)
    .attr('width', d => x(d.valeur));

  // Value labels
  bars.append('text')
    .attr('x', d => x(d.valeur) + 8)
    .attr('y', d => y(d.secteur) + y.bandwidth() / 2)
    .attr('dy', '0.35em')
    .text(d => `+${d.valeur}%`)
    .style('opacity', 0)
    .transition().delay(600).duration(400)
    .style('opacity', 1);
}

// ═══════════════════════════════════════════════════════════
//  5. CARTE RÉGIONALE — CHOROPLETH
// ═══════════════════════════════════════════════════════════
function buildCarte() {
  const el = document.getElementById('chart-carte');
  const W = Math.max(850, el.clientWidth || 900);
  const H = 780;
  const data = DATA.regions;

  // Mapping: data region names → GeoJSON region names
  const nameMap = {
    "Souss-Massa": "Souss Massa",
    "Béni Mellal-Khénifra": "Beni Mellal-Khenifra",
    "Marrakech-Safi": "Marrakech-Safi",
    "Casablanca-Settat": "Casablanca-Settat",
    "Rabat-Salé-Kénitra": "Rabat-Sale-Kenitra",
    "Fès-Meknès": "Fes-Meknes",
    "Tanger-Tétouan-Al Hoceïma": "Tanger-Tetouan-Hoceima",
    "Drâa-Tafilalet": "Daraa-Tafilelt",
    "L'Oriental": "Oriental",
    "Laâyoune-Sakia El Hamra": "Laayoune-Saguia Hamra",
    "Dakhla-Oued Ed-Dahab": "Dakhla-Oued Eddahab",
    "Guelmim-Oued Noun": "Guelmim-Oued Noun"
  };

  // Reverse map: GeoJSON name → data region name
  const reverseMap = {};
  Object.entries(nameMap).forEach(([k, v]) => { reverseMap[v] = k; });

  // Build lookup: geoName → { region, montant, ... }
  const dataByGeoName = {};
  data.forEach(d => {
    const geoName = nameMap[d.region] || d.region;
    dataByGeoName[geoName] = d;
  });

  // Color scale: sequential gradient from light to deep
  const minVal = d3.min(data, d => d.montant);
  const maxVal = d3.max(data, d => d.montant);
  const colorScale = d3.scaleSequential()
    .domain([minVal * 0.8, maxVal])
    .interpolator(d3.interpolateRgbBasis([
      '#e8f4f8', '#b2dfdb', '#4db6ac', '#00897b', '#00695c',
      '#004d40', '#1b3a4b', '#0d2137'
    ]));

  d3.select('#chart-carte').html('');

  const svg = d3.select('#chart-carte').append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  // Subtle gradient background
  const defs = svg.append('defs');
  const bgGrad = defs.append('linearGradient').attr('id', 'mapBg').attr('x1', '0%').attr('y1', '0%').attr('x2', '100%').attr('y2', '100%');
  bgGrad.append('stop').attr('offset', '0%').attr('stop-color', '#f0f4f8');
  bgGrad.append('stop').attr('offset', '100%').attr('stop-color', '#e2e8f0');
  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#mapBg)').attr('rx', 12);

  // Drop shadow filter for regions
  const shadow = defs.append('filter').attr('id', 'regionShadow').attr('x', '-5%').attr('y', '-5%').attr('width', '110%').attr('height', '110%');
  shadow.append('feDropShadow').attr('dx', 1).attr('dy', 2).attr('stdDeviation', 3).attr('flood-color', 'rgba(0,0,0,0.15)');

  // Glow filter for hover
  const glow = defs.append('filter').attr('id', 'regionGlow').attr('x', '-10%').attr('y', '-10%').attr('width', '120%').attr('height', '120%');
  glow.append('feDropShadow').attr('dx', 0).attr('dy', 0).attr('stdDeviation', 6).attr('flood-color', '#d4a017').attr('flood-opacity', 0.7);

  // Legend gradient
  const lgGrad = defs.append('linearGradient').attr('id', 'legendGrad').attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
  const nStops = 10;
  for (let i = 0; i <= nStops; i++) {
    const t = i / nStops;
    const val = minVal * 0.8 + t * (maxVal - minVal * 0.8);
    lgGrad.append('stop').attr('offset', `${t * 100}%`).attr('stop-color', colorScale(maxVal - (val - minVal * 0.8)));
  }

  const geojson = MOROCCO_GEOJSON;
  const projection = d3.geoMercator();

  // Margins for map + legend
  const margin = { left: 30, top: 50, right: 280, bottom: 30 };
  const mapW = W - margin.left - margin.right;
  const mapH = H - margin.top - margin.bottom;

  projection.fitSize([mapW, mapH], geojson);
  const [ttx, tty] = projection.translate();
  projection.translate([ttx + margin.left, tty + margin.top]);

  const path = d3.geoPath().projection(projection);

  // ── DRAW CHOROPLETH REGIONS ──
  const regionGroup = svg.append('g').attr('filter', 'url(#regionShadow)');

  regionGroup.selectAll('path')
    .data(geojson.features).join('path')
    .attr('d', path)
    .attr('fill', feat => {
      const geoName = feat.properties.region;
      const d = dataByGeoName[geoName];
      return d ? colorScale(d.montant) : '#cbd5e1';
    })
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 1.8)
    .attr('cursor', 'pointer')
    .on('mouseover', function (evt, feat) {
      const geoName = feat.properties.region;
      const d = dataByGeoName[geoName];
      d3.select(this)
        .raise()
        .transition().duration(200)
        .attr('stroke', '#d4a017')
        .attr('stroke-width', 3)
        .attr('filter', 'url(#regionGlow)');
      if (d) {
        showTip(evt,
          `<div class="tt-title">${d.region}</div>
           <div class="tt-value">${(d.montant * 1000).toFixed(1)} MDH</div>
           <div>${d.montant.toFixed(5)} MMDH</div>`);
      }
    })
    .on('mousemove', evt => {
      tooltip.style('left', (evt.clientX + 14) + 'px').style('top', (evt.clientY - 10) + 'px');
    })
    .on('mouseout', function () {
      d3.select(this)
        .transition().duration(300)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.8)
        .attr('filter', 'url(#regionShadow)');
      hideTip();
    });

  // ── REGION LABELS (on each region) ──
  const labelData = geojson.features.map(feat => {
    const geoName = feat.properties.region;
    const d = dataByGeoName[geoName];
    const cent = path.centroid(feat);
    const displayName = d ? d.region : (reverseMap[geoName] || geoName);
    const montant = d ? d.montant : 0;
    return { displayName, montant, cx: cent[0], cy: cent[1], geoName };
  }).filter(d => !isNaN(d.cx) && !isNaN(d.cy));

  // Short labels for small regions
  const shortNames = {
    "Rabat-Salé-Kénitra": "Rabat-Salé",
    "Casablanca-Settat": "Casa-Settat",
    "Tanger-Tétouan-Al Hoceïma": "Tanger-Tét.",
    "Béni Mellal-Khénifra": "Béni Mellal",
    "Laâyoune-Sakia El Hamra": "Laâyoune",
    "Dakhla-Oued Ed-Dahab": "Dakhla",
    "Guelmim-Oued Noun": "Guelmim",
    "Drâa-Tafilalet": "Drâa-Tafil.",
    "L'Oriental": "Oriental",
    "Fès-Meknès": "Fès-Meknès",
    "Marrakech-Safi": "Marrakech",
    "Souss-Massa": "Souss-Massa"
  };

  const labelsGroup = svg.append('g');
  labelData.forEach(d => {
    const shortName = shortNames[d.displayName] || d.displayName;
    const fillColor = d.montant > 0 ? colorScale(d.montant) : '#999';
    const textColor = getContrastColor(fillColor);

    // Region name
    labelsGroup.append('text')
      .attr('x', d.cx).attr('y', d.cy - 4)
      .attr('text-anchor', 'middle')
      .style('font-size', '8.5px')
      .style('font-weight', '700')
      .style('fill', textColor)
      .style('pointer-events', 'none')
      .style('text-shadow', textColor === '#FFFFFF'
        ? '0 1px 3px rgba(0,0,0,0.7)'
        : '0 1px 2px rgba(255,255,255,0.6)')
      .text(shortName);

    // Amount
    if (d.montant > 0) {
      labelsGroup.append('text')
        .attr('x', d.cx).attr('y', d.cy + 9)
        .attr('text-anchor', 'middle')
        .style('font-size', '7.5px')
        .style('font-weight', '600')
        .style('fill', textColor)
        .style('opacity', 0.85)
        .style('pointer-events', 'none')
        .style('text-shadow', textColor === '#FFFFFF'
          ? '0 1px 3px rgba(0,0,0,0.7)'
          : '0 1px 2px rgba(255,255,255,0.6)')
        .text(`${(d.montant * 1000).toFixed(1)} MDH`);
    }
  });

  // ── GRADIENT LEGEND ──
  const lgX = W - 260;
  const lgY = 40;
  const lgW = 240;
  const lgH = 450;
  const lg = svg.append('g').attr('transform', `translate(${lgX}, ${lgY})`);

  // Legend card background
  lg.append('rect')
    .attr('width', lgW).attr('height', lgH).attr('rx', 12)
    .attr('fill', '#ffffff').attr('stroke', '#e2e8f0').attr('stroke-width', 1)
    .style('filter', 'drop-shadow(0 2px 8px rgba(0,0,0,0.08))');

  // Title
  lg.append('text').attr('x', lgW / 2).attr('y', 28)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px').style('font-weight', '800').style('fill', '#0F2850')
    .text('Investissement par Région');

  lg.append('text').attr('x', lgW / 2).attr('y', 44)
    .attr('text-anchor', 'middle')
    .style('font-size', '9px').style('fill', '#64748b')
    .text('(en Millions de DH)');

  // Gradient bar
  const barX = 18, barY = 58, barW = 18, barH = 180;
  lg.append('rect')
    .attr('x', barX).attr('y', barY).attr('width', barW).attr('height', barH)
    .attr('rx', 4).attr('fill', 'url(#legendGrad)');

  // Scale ticks
  const tickScale = d3.scaleLinear().domain([maxVal, minVal * 0.8]).range([barY, barY + barH]);
  const tickVals = d3.range(minVal, maxVal + 0.001, (maxVal - minVal) / 5);
  tickVals.forEach(v => {
    const y = tickScale(v);
    lg.append('line').attr('x1', barX + barW).attr('x2', barX + barW + 5).attr('y1', y).attr('y2', y)
      .attr('stroke', '#94a3b8').attr('stroke-width', 0.8);
    lg.append('text').attr('x', barX + barW + 8).attr('y', y + 3)
      .style('font-size', '8.5px').style('fill', '#475569')
      .text(`${(v * 1000).toFixed(1)}`);
  });

  // Sorted region list alongside
  const sortedData = [...data].sort((a, b) => b.montant - a.montant);
  const listY = barY + barH + 20;
  lg.append('text').attr('x', lgW / 2).attr('y', listY)
    .attr('text-anchor', 'middle')
    .style('font-size', '9px').style('font-weight', '700').style('fill', '#0F2850')
    .text('Classement');

  sortedData.forEach((d, i) => {
    const rowY = listY + 16 + i * 14;
    const short = shortNames[d.region] || d.region;

    // Rank badge
    lg.append('circle')
      .attr('cx', 14).attr('cy', rowY - 3).attr('r', 5)
      .attr('fill', colorScale(d.montant));

    lg.append('text').attr('x', 14).attr('y', rowY - 3)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .style('font-size', '6px').style('font-weight', '700')
      .style('fill', getContrastColor(colorScale(d.montant)))
      .text(i + 1);

    // Region name + value
    lg.append('text').attr('x', 24).attr('y', rowY)
      .style('font-size', '8.5px').style('fill', '#1e293b')
      .text(`${short}`);

    lg.append('text').attr('x', lgW - 14).attr('y', rowY)
      .attr('text-anchor', 'end')
      .style('font-size', '8px').style('font-weight', '600').style('fill', '#0F2850')
      .text(`${(d.montant * 1000).toFixed(1)}`);
  });
}

// ═══════════════════════════════════════════════════════════
//  NAVIGATION & SCROLL
// ═══════════════════════════════════════════════════════════
function initNavigation() {
  const links = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.section');
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    toggle.textContent = sidebar.classList.contains('open') ? '✕' : '☰';
  });

  links.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        sidebar.classList.remove('open');
        toggle.textContent = '☰';
      }
    });
  });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        const id = entry.target.id;
        links.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.nav-link[data-section="${id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { threshold: 0.15 });

  sections.forEach(s => observer.observe(s));
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  console.log('PLF 2026 Dashboard D3.js — Initializing...');

  try { buildSankey(); console.log('✅ Sankey'); } catch (e) { console.error('❌ Sankey:', e); }
  try { buildTreemap('chart-treemap-invest', DATA.inv_data, d3.interpolateYlGnBu, 0.8); console.log('✅ Treemap Invest'); } catch (e) { console.error('❌ Treemap Invest:', e); }
  try { buildTreemap('chart-treemap-global', DATA.glob_data, d3.interpolatePlasma, 0.8); console.log('✅ Treemap Global'); } catch (e) { console.error('❌ Treemap Global:', e); }
  try { buildMacro(); console.log('✅ Macro'); } catch (e) { console.error('❌ Macro:', e); }
  try { buildCarte(); console.log('✅ Carte'); } catch (e) { console.error('❌ Carte:', e); }

  initNavigation();
  document.getElementById('hero').classList.add('animate-in');
  console.log('PLF 2026 Dashboard D3.js — Ready!');
});

// ═══════════════════════════════════════════════════════════
//  EXPORT SVG — Fonction universelle pour tous les graphes
// ═══════════════════════════════════════════════════════════
window.exportSVG = function (chartId, filename, titleText) {
  const originalSvg = document.querySelector(`#${chartId} svg`);
  if (!originalSvg) { alert('Graphe non trouvé'); return; }

  const clone = originalSvg.cloneNode(true);
  const vb = originalSvg.viewBox.baseVal;
  const chartW = vb.width || originalSvg.getBoundingClientRect().width || 1000;
  const chartH = vb.height || originalSvg.getBoundingClientRect().height || 600;
  const totalH = chartH + 50;

  const ns = 'http://www.w3.org/2000/svg';
  const newSvg = document.createElementNS(ns, 'svg');
  newSvg.setAttribute('xmlns', ns);
  newSvg.setAttribute('viewBox', `0 0 ${chartW} ${totalH}`);
  newSvg.setAttribute('width', chartW);
  newSvg.setAttribute('height', totalH);

  // Styles intégrés
  const defs = document.createElementNS(ns, 'defs');
  const style = document.createElementNS(ns, 'style');
  style.textContent = `
    text { font-family: 'Inter', Arial, sans-serif; }
    .sankey-link { fill: none; }
    .svg-title { font-family: 'Playfair Display', Georgia, serif; font-size: 18px; font-weight: 700; fill: #0F2850; }
    .treemap-cell text { fill: white; text-shadow: 0 1px 3px rgba(0,0,0,0.5); }
    .treemap-cell .cell-name { font-weight: 600; font-size: 12px; }
    .treemap-cell .cell-value { font-size: 11px; opacity: 0.9; }
    .axis text { font-size: 13px; fill: #1e293b; font-weight: 500; }
    .map-label { font-size: 10px; font-weight: 600; fill: #0F2850; }
  `;
  defs.appendChild(style);
  newSvg.appendChild(defs);

  // Fond blanc
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', chartW);
  bg.setAttribute('height', totalH);
  bg.setAttribute('fill', 'white');
  newSvg.appendChild(bg);

  // Titre
  const title = document.createElementNS(ns, 'text');
  title.setAttribute('x', chartW / 2);
  title.setAttribute('y', 28);
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('class', 'svg-title');
  title.textContent = titleText;
  newSvg.appendChild(title);

  // Graphe
  const chartGroup = document.createElementNS(ns, 'g');
  chartGroup.setAttribute('transform', 'translate(0, 40)');
  while (clone.firstChild) {
    chartGroup.appendChild(clone.firstChild);
  }
  newSvg.appendChild(chartGroup);

  // Télécharger
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(newSvg);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};
