/** All external credentials remain on the Python server. */
export async function request(path, body) {
  const response = await fetch('/api/' + path, body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) {
    if(response.status===401) window.dispatchEvent(new Event('session-expired'));
    throw new Error(data.error || 'The request could not be completed.');
  }
  return data;
}
export const ask = (task, payload) => request('ai/' + task, payload);
