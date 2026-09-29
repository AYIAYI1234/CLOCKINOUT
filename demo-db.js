/* Demo database for Field Clock.
   Implements the small subset of the artifact "db" and "downloads" APIs the app uses,
   backed by localStorage. Data lives in this browser only. */
(function () {
  var KEY = 'fieldclock-demo-v1';
  var listeners = [];

  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

  function seed() {
    var now = new Date();
    var reps = {
      ali:  { name: 'Ali Rahman',  pin: '1111', status: 'in',  lastAt: null },
      sara: { name: 'Sara Lim',    pin: '2222', status: 'out', lastAt: null },
      ben:  { name: 'Ben Tan',     pin: '3333', status: 'out', lastAt: null }
    };
    var entries = {};
    function at(daysAgo, h, m) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m, 0);
      return d.toISOString();
    }
    function add(repId, type, ts) {
      entries[uid()] = { repId: repId, repName: reps[repId].name, type: type, ts: ts };
    }
    [1, 2, 3].forEach(function (d) {
      add('ali', 'in', at(d, 8, 2));  add('ali', 'out', at(d, 16, 31));
      add('sara', 'in', at(d, 9, 0)); add('sara', 'out', at(d, 17, 5));
      if (d !== 2) { add('ben', 'in', at(d, 7, 45)); add('ben', 'out', at(d, 15, 50)); }
    });
    var todayIn = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
    add('ali', 'in', todayIn);
    reps.ali.lastAt = todayIn;
    reps.sara.lastAt = at(1, 17, 5);
    reps.ben.lastAt = at(1, 15, 50);
    return { reps: reps, entries: entries, config: { admin: { pin: '0000' } } };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    var s = seed();
    save(s);
    return s;
  }
  var store = load();
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s || store)); } catch (e) {} }
  function notify() { listeners.slice().forEach(function (fn) { fn(); }); }

  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { store = load(); notify(); }
  });

  function coll(name) { return store[name] || (store[name] = {}); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function docSnap(name, id) {
    var data = coll(name)[id];
    return { id: id, exists: data !== undefined, data: function () { return data === undefined ? undefined : clone(data); } };
  }

  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function test(v, op, x) {
    switch (op) {
      case '==': case '===': return v === x;
      case '!=': return v !== x;
      case '>': return v > x;
      case '>=': return v >= x;
      case '<': return v < x;
      case '<=': return v <= x;
      default: return true;
    }
  }

  function Query(name, wheres, order, lim) {
    this.name = name; this.wheres = wheres || []; this.order = order || null; this.lim = lim || null;
  }
  Query.prototype.where = function (f, op, v) { return new Query(this.name, this.wheres.concat([[f, op, v]]), this.order, this.lim); };
  Query.prototype.orderBy = function (f, dir) { return new Query(this.name, this.wheres, { f: f, dir: dir || 'asc' }, this.lim); };
  Query.prototype.limit = function (n) { return new Query(this.name, this.wheres, this.order, n); };
  Query.prototype._run = function () {
    var c = coll(this.name);
    var rows = Object.keys(c).map(function (id) { return { id: id, d: c[id] }; });
    this.wheres.forEach(function (w) { rows = rows.filter(function (r) { return test(r.d[w[0]], w[1], w[2]); }); });
    if (this.order) {
      var o = this.order;
      rows.sort(function (a, b) { var r = cmp(a.d[o.f], b.d[o.f]); return o.dir === 'desc' ? -r : r; });
    }
    if (this.lim) rows = rows.slice(0, this.lim);
    var name = this.name;
    return { docs: rows.map(function (r) { return docSnap(name, r.id); }), size: rows.length, empty: rows.length === 0 };
  };
  Query.prototype.get = function () { var self = this; return Promise.resolve().then(function () { return self._run(); }); };
  Query.prototype.onSnapshot = function (cb) {
    var self = this, closed = false;
    function fire() { if (!closed) cb(self._run()); }
    listeners.push(fire);
    setTimeout(fire, 0);
    return function () { closed = true; listeners = listeners.filter(function (f) { return f !== fire; }); };
  };
  Query.prototype.add = function (data) {
    var id = uid(); coll(this.name)[id] = clone(data); save(); notify();
    return Promise.resolve({ id: id });
  };
  Query.prototype.doc = function (id) { return docRef(this.name, id); };

  function docRef(name, id) {
    return {
      id: id,
      get: function () { return Promise.resolve(docSnap(name, id)); },
      set: function (data) { coll(name)[id] = clone(data); save(); notify(); return Promise.resolve(); },
      update: function (data) {
        var c = coll(name);
        if (c[id] === undefined) return Promise.reject(new Error('not found'));
        Object.keys(data).forEach(function (k) { c[id][k] = clone(data[k]); });
        save(); notify(); return Promise.resolve();
      },
      delete: function () { delete coll(name)[id]; save(); notify(); return Promise.resolve(); }
    };
  }

  var db = {
    collection: function (name) { return new Query(name); },
    doc: function (path) { var p = path.split('/'); return docRef(p[0], p[1]); }
  };

  var downloads = {
    save: function (opts) {
      return new Promise(function (resolve) {
        var url = URL.createObjectURL(opts.data);
        var a = document.createElement('a');
        a.href = url; a.download = opts.filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        resolve();
      });
    }
  };

  window.fieldClockDemo = {
    reset: function () { store = seed(); save(); notify(); }
  };
  window.claude = window.claude || {};
  window.claude.use = function (name) {
    return Promise.resolve(name === 'db' ? db : name === 'downloads' ? downloads : null);
  };
})();
