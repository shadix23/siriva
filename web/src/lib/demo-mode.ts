// Флаг «открыто из демо для жюри»: только на эту вкладку (sessionStorage).
export function isDemoMode(): boolean {
  try {
    return window.sessionStorage.getItem("es.demo") === "1";
  } catch {
    return false;
  }
}
export function setDemoMode(on: boolean) {
  try {
    if (on) window.sessionStorage.setItem("es.demo", "1");
    else window.sessionStorage.removeItem("es.demo");
  } catch {
    /* ничего */
  }
}
