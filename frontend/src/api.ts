export type Scenario = {
  latitud: number;
  longitud: number;
  profundidad_km: number;
  magnitud: number;
};
export type Prediction = {
  nivel_impacto: string;
  probabilidades: Record<string, number>;
  nombre_modelo: string;
  version_modelo: string;
  estado_validacion: string;
  advertencias: string[];
};
const base = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

export const isLocalApi = ["localhost", "127.0.0.1", "[::1]"].includes(
  new URL(base, window.location.origin).hostname,
);

export async function prepare(signal: AbortSignal): Promise<void> {
  // 12 intentos acotados, sin sondeo permanente para mantener despierto Render.
  for (let attempt = 0; attempt < (isLocalApi ? 1 : 12); attempt++) {
    signal.throwIfAborted();
    try {
      const response = await fetch(`${base}/ready`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });
      if (response.ok) return;
      if (response.status === 503)
        throw new Error(
          "El clasificador no está disponible. Intenta nuevamente más tarde.",
        );
      if (response.status < 500)
        throw new Error("La configuración del servicio necesita revisión.");
    } catch (error) {
      if (signal.aborted) throw error;
      if (
        isLocalApi &&
        !(
          error instanceof Error &&
          (error.message.startsWith("El clasificador") ||
            error.message.startsWith("La configuración"))
        )
      )
        throw new Error(
          `No se pudo conectar con la API local (${base}). Inicia el backend y comprueba /ready.`,
        );
      if (
        error instanceof Error &&
        (error.message.startsWith("El clasificador") ||
          error.message.startsWith("La configuración"))
      )
        throw error;
    }
    if (isLocalApi) break;
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 3000);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  throw new Error(
    "El servicio sigue iniciando o no está accesible. Puedes reintentar.",
  );
}

export async function predict(
  scenario: Scenario,
  signal: AbortSignal,
): Promise<Prediction> {
  const response = await fetch(`${base}/api/v1/predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scenario),
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
  });
  if (!response.ok)
    throw new Error(
      response.status === 422
        ? "Revisa los parámetros del escenario."
        : "No se pudo evaluar el escenario. Intenta nuevamente.",
    );
  return response.json();
}
