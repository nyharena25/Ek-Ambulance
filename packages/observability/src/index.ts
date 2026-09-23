// Stub OpenTelemetry tracer bootstrap contract for @sahayak/observability
export function initTracer(serviceName: string) {
  return {
    serviceName,
    startSpan: (name: string) => ({
      name,
      end: () => {}
    })
  };
}
