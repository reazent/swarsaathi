const DB_NAME = "swarsaathi-practice";
const DB_VERSION = 1;
const STORE = "recordings";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(mode, callback) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const request = callback(store);
    tx.oncomplete = () => {
      db.close();
      resolve(request?.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  }));
}

export async function saveRecording({ blob, title, durationSec, target, sa }) {
  const createdAt = new Date().toISOString();
  const id = `${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  await withStore("readwrite", (store) => store.put({
    id,
    blob,
    title: title || "Practice session",
    durationSec: Math.max(0, Math.round(durationSec || 0)),
    target: target || "Free practice",
    sa: sa || "",
    createdAt,
    mimeType: blob.type || "audio/webm",
  }));
  return id;
}

export async function listRecordings() {
  const records = await withStore("readonly", (store) => store.getAll()) || [];
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteRecording(id) {
  await withStore("readwrite", (store) => store.delete(id));
}

function extensionFor(mimeType = "") {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export async function shareRecording(record) {
  const ext = extensionFor(record.mimeType);
  const fileName = `SwarPractice-${record.createdAt.slice(0, 10)}.${ext}`;

  const file = new File(
    [record.blob],
    fileName,
    { type: record.mimeType || record.blob.type },
  );
  const canShareFile = typeof navigator.share === "function"
    && (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }));

  if (canShareFile) {
    try {
      await navigator.share({
        files: [file],
        title: "SwarPractice recording",
        text: [record.target, record.sa].filter(Boolean).join(" · "),
      });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      // Some browsers expose file sharing but reject individual audio formats.
      // Downloading the recording keeps the user's action useful.
    }
  }

  const url = URL.createObjectURL(record.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "downloaded";
}
