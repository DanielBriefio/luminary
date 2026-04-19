// ── RIS parser ────────────────────────────────────────────────────────────────

export function parseRis(text) {
  const records = [];
  let current = null;

  for (const rawLine of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    const m = line.match(/^([A-Z][A-Z0-9])\s{1,2}-\s+(.*)$/);
    if (!m) continue;
    const [, tag, value] = m;

    if (tag === 'TY') { current = { authors: [], ris_type: value.trim() }; continue; }
    if (tag === 'ER') { if (current) records.push(current); current = null; continue; }
    if (!current) continue;

    switch (tag) {
      case 'TI': case 'T1': case 'CT':                 current.title    = value; break;
      case 'AU': case 'A1': case 'A2': case 'A3': case 'A4': current.authors.push(value); break;
      case 'JO': case 'JF': case 'T2': case 'BT':      if (!current.journal) current.journal = value; break;
      case 'PY': case 'Y1':                             current.year     = value.slice(0, 4); break;
      case 'DA':                                         if (!current.year) current.year = value.slice(0, 4); break;
      case 'DO':                                         current.doi      = value; break;
      case 'AB': case 'N2':                             current.abstract = value; break;
      case 'VL':                                         current.volume   = value; break;
      case 'IS': case 'CP':                             current.issue    = value; break;
      case 'SP':                                         current.sp       = value; break;
      case 'EP':                                         current.ep       = value; break;
    }
  }
  if (current) records.push(current);

  return records.filter(r => r.title).map(r => {
    const pages = r.sp ? (r.ep && r.ep !== r.sp ? `${r.sp}-${r.ep}` : r.sp) : '';
    return {
      title:    r.title.trim(),
      authors:  r.authors.join('; '),
      journal:  (r.journal  || '').trim(),
      year:     (r.year     || '').trim(),
      doi:      (r.doi      || '').trim(),
      abstract: (r.abstract || '').trim(),
      volume:   r.volume || '',
      issue:    r.issue  || '',
      pages,
      pub_type: _risType(r.ris_type),
    };
  });
}

function _risType(ty) {
  return { JOUR:'journal', JFULL:'journal', MGZN:'journal', CONF:'conference',
    CPAPER:'conference', BOOK:'book', CHAP:'book', EDBOOK:'book',
    RPRT:'other', THES:'other', ABST:'poster', UNPB:'preprint' }[ty] || 'journal';
}

// ── BibTeX parser ─────────────────────────────────────────────────────────────

export function parseBib(text) {
  const records = [];
  const entries = text.matchAll(/@(\w+)\s*\{([^@]*)/gs);

  for (const m of entries) {
    const entryType = m[1].toLowerCase();
    if (['string','preamble','comment'].includes(entryType)) continue;
    const fields = _parseBibBody(m[2]);

    const authors = (fields.author || fields.editor || '')
      .split(/\s+and\s+/i).map(a => a.trim()).filter(Boolean).join('; ');
    const pages = (fields.pages || '').replace(/--/g, '-');

    records.push({
      title:    _strip(fields.title   || ''),
      authors,
      journal:  _strip(fields.journal || fields.booktitle || fields.publisher || ''),
      year:     (fields.year || '').replace(/\D/g, '').slice(0, 4),
      doi:      (fields.doi  || '').replace(/^https?:\/\/doi\.org\//i, '').trim(),
      abstract: _strip(fields.abstract || ''),
      volume:   fields.volume || '',
      issue:    fields.number || fields.issue || '',
      pages,
      pub_type: _bibType(entryType),
    });
  }
  return records.filter(r => r.title);
}

function _parseBibBody(body) {
  const fields = {};
  let i = 0;
  // skip citation key
  while (i < body.length && body[i] !== ',') i++;
  i++;

  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++;
    if (i >= body.length || body[i] === '}') break;

    const nameStart = i;
    while (i < body.length && body[i] !== '=' && body[i] !== '}') i++;
    if (body[i] !== '=') break;
    const name = body.slice(nameStart, i).trim().toLowerCase();
    i++;

    while (i < body.length && /\s/.test(body[i])) i++;

    let value = '';
    if (body[i] === '{') {
      let depth = 0, start = i;
      while (i < body.length) {
        if (body[i] === '{') depth++;
        else if (body[i] === '}') { depth--; if (depth === 0) { i++; break; } }
        i++;
      }
      value = body.slice(start + 1, i - 1);
    } else if (body[i] === '"') {
      i++;
      const start = i;
      while (i < body.length && body[i] !== '"') i++;
      value = body.slice(start, i);
      i++;
    } else {
      const start = i;
      while (i < body.length && !/[,}\s]/.test(body[i])) i++;
      value = body.slice(start, i);
    }

    if (name) fields[name] = value;
    while (i < body.length && /[\s,]/.test(body[i])) i++;
  }
  return fields;
}

function _strip(s) { return s.replace(/[{}]/g, '').trim(); }

function _bibType(t) {
  return { article:'journal', review:'review', inproceedings:'conference',
    proceedings:'conference', book:'book', incollection:'book', inbook:'book',
    phdthesis:'other', mastersthesis:'other', techreport:'other',
    misc:'other', unpublished:'preprint' }[t] || 'journal';
}

// ── Citation builder from RIS/BibTeX fields ───────────────────────────────────

export function buildCitationFromRef({ journal, year, volume, issue, pages, doi }) {
  let cite = journal ? journal + '.' : '';
  if (year)   cite += ' ' + year;
  if (volume) { cite += ';' + volume; if (issue) cite += '(' + issue + ')'; }
  if (pages)  cite += ':' + pages;
  if (doi)    cite += '. doi: ' + doi;
  return cite.trim();
}
