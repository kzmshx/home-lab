/// SSE (Server-Sent Events) client via JS FFI.
/// Connects to an EventSource URL and calls the callback on each message.

/// Connect to an SSE endpoint. Returns a handle ID for closing.
pub fn connect(url : String, on_message : (String) -> Unit, on_error : (String) -> Unit) -> Int {
  js_sse_connect(url, on_message, on_error)
}

/// Close an SSE connection by handle ID.
pub fn close(handle : Int) -> Unit {
  js_sse_close(handle)
}

extern "js" fn js_sse_connect(
  url : String,
  on_message : (String) -> Unit,
  on_error : (String) -> Unit,
) -> Int =
  #|(url, onMsg, onErr) => {
  #|  if (!window.__sseHandles) window.__sseHandles = {};
  #|  const id = Date.now();
  #|  const es = new EventSource(url);
  #|  es.onmessage = (e) => onMsg(e.data);
  #|  es.onerror = () => onErr('SSE connection error');
  #|  window.__sseHandles[id] = es;
  #|  return id;
  #|}

extern "js" fn js_sse_close(handle : Int) -> Unit =
  #|(id) => {
  #|  if (window.__sseHandles && window.__sseHandles[id]) {
  #|    window.__sseHandles[id].close();
  #|    delete window.__sseHandles[id];
  #|  }
  #|}
