function generateUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function getInstanceId() {
  let id = sessionStorage.getItem('envairo_instance_id');
  if (!id) {
    id = generateUUID();
    sessionStorage.setItem('envairo_instance_id', id);
  }
  return id;
}
