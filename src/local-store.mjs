function openDatabase(databaseName, storeNames) {
  if (!globalThis.indexedDB) throw new Error('当前浏览器未开放本地存储，请导出 JSON 备份。');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of storeNames) db.createObjectStore(name, {keyPath:'id'});
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('本地资料库被旧页面占用，请关闭旧页面后重试。'));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) return db.close();
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function transact(databaseName, storeNames, stores, mode, execute) {
  const db = await openDatabase(databaseName, storeNames);
  try {
    const tx = db.transaction(stores, mode);
    const completed = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error ?? new Error('数据保存已中断。'));
    });
    const operation = execute(tx).catch(error => {
      try { tx.abort(); } catch { /* The failing request may already have aborted it. */ }
      throw error;
    });
    const [value] = await Promise.all([operation, completed]);
    return value;
  } catch (error) {
    if (error.name === 'QuotaExceededError') throw new Error('浏览器本地空间不足，请先导出备份。');
    throw error;
  } finally {
    db.close();
  }
}
