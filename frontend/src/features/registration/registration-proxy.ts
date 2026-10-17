export type RegistrationProxyChoice = {
  id: string;
  probeStatus: "unknown" | "healthy" | "unhealthy";
};

export function chooseRegistrationProxy(currentId: string, nodes: RegistrationProxyChoice[]): string {
  if (nodes.length === 0) {
    return "";
  }
  if (nodes.some((node) => node.id === currentId)) {
    return currentId;
  }
  return nodes.find((node) => node.probeStatus === "healthy")?.id ?? nodes[0].id;
}
