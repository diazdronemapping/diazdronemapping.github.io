/**
 * project-store.js — abstracción de almacenamiento del Studio.
 *
 * Dos backends con la misma interfaz:
 *  · FileSystemStore — File System Access API (Chrome/Edge escritorio). Lee y
 *    escribe DIRECTO la carpeta del proyecto que Diego elige. Es el modo real.
 *  · HttpStore — carga un tour por HTTP (solo lectura) y "guarda" descargando
 *    el manifest. Sirve para verificación automatizada (Playwright no puede
 *    manejar el selector nativo de carpetas).
 *
 * Interfaz común:
 *   label            → string para la UI
 *   canWrite         → bool (FS sí, HTTP no persiste)
 *   readManifest()   → objeto
 *   writeManifest(o) → persiste (FS) o descarga (HTTP)
 *   prepare(path)    → asegura que assetUrl(path) resuelva síncrono
 *   assetUrl(path)   → string (URL usable por <img>/PSV) — SÍNCRONO
 *   putAsset(sub, blob) → escribe un asset dentro del bundle, devuelve su path
 */

/* Resuelve un path del manifest: '/' inicial = raíz del sitio · relativo = bundle. */
function isSiteRoot(p) { return p.startsWith('/') || /^https?:/.test(p); }

/* --------------------------------------------------------------------- */
/*  File System Access — modo real (Chrome/Edge desktop)                 */
/* --------------------------------------------------------------------- */
export class FileSystemStore {
  constructor(dirHandle) {
    this.dir = dirHandle;
    this.label = dirHandle.name;
    this.canWrite = true;
    this._urlCache = new Map();     // path relativo → objectURL
  }

  static get available() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  static async pickExisting() {
    const dir = await window.showDirectoryPicker({ id: 'recorridos-tour', mode: 'readwrite' });
    return new FileSystemStore(dir);
  }

  /** Crea una carpeta de tour nueva dentro de una carpeta padre que el usuario elige. */
  static async createNew(slug) {
    const parent = await window.showDirectoryPicker({ id: 'recorridos-tours', mode: 'readwrite' });
    const dir = await parent.getDirectoryHandle(slug, { create: true });
    // estructura estándar del bundle
    for (const sub of ['assets/360', 'assets/thumbs', 'assets/plan', 'assets/geo', 'assets/brand', 'assets/audio']) {
      await ensureDir(dir, sub);
    }
    return new FileSystemStore(dir);
  }

  async _fileHandle(path, { create = false } = {}) {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    let d = this.dir;
    for (const seg of parts) d = await d.getDirectoryHandle(seg, { create });
    return d.getFileHandle(name, { create });
  }

  async readManifest() {
    const fh = await this._fileHandle('manifest.json');
    const f = await fh.getFile();
    return JSON.parse(await f.text());
  }

  async writeManifest(obj) {
    const fh = await this._fileHandle('manifest.json', { create: true });
    const w = await fh.createWritable();          // atómico: escribe a temp y swap al close
    await w.write(JSON.stringify(obj, null, 2));
    await w.close();
  }

  async prepare(path) {
    if (!path || isSiteRoot(path) || this._urlCache.has(path)) return;
    try {
      const fh = await this._fileHandle(path);
      const f = await fh.getFile();
      this._urlCache.set(path, URL.createObjectURL(f));
    } catch { /* asset ausente — assetUrl devolverá '' */ }
  }

  assetUrl(path) {
    if (!path) return '';
    if (isSiteRoot(path)) return path;            // nube/ortho compartidos: raíz del sitio publicado
    return this._urlCache.get(path) || '';
  }

  /** Escribe un blob en <sub> del bundle y devuelve el path relativo. */
  async putAsset(sub, blob) {
    const fh = await this._fileHandle(sub, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    this._urlCache.set(sub, URL.createObjectURL(blob));
    return sub;
  }
}

async function ensureDir(root, path) {
  let d = root;
  for (const seg of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(seg, { create: true });
  return d;
}

/* --------------------------------------------------------------------- */
/*  HTTP — modo dev / verificación (solo lectura + descarga)             */
/* --------------------------------------------------------------------- */
export class HttpStore {
  constructor(baseUrl) {
    // baseUrl termina en '/'; los paths relativos cuelgan de aquí
    this.base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this.label = decodeURIComponent(this.base.replace(/\/$/, '').split('/').pop()) + ' (dev · solo lectura)';
    this.canWrite = false;
    this._mem = new Map();   // assets agregados en la sesión (no persisten): path → objectURL
  }

  async readManifest() {
    const r = await fetch(this.base + 'manifest.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`manifest ${r.status}`);
    return r.json();
  }

  /** En dev no hay escritura a disco: descarga el manifest para revisión. */
  async writeManifest(obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'manifest.json';
    document.body.appendChild(a); a.click(); a.remove();
  }

  async prepare() { /* http resuelve síncrono en assetUrl */ }

  assetUrl(path) {
    if (!path) return '';
    if (this._mem.has(path)) return this._mem.get(path);
    if (isSiteRoot(path)) return path;
    return this.base + path;
  }

  async putAsset(sub, blob) {
    // no persiste, pero mantiene el object URL en memoria para previsualizar en la sesión
    this._mem.set(sub, URL.createObjectURL(blob));
    return sub;
  }
}
