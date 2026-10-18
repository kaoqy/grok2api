export function headedBrowserEnabled(headless: boolean): boolean {
  return !headless;
}

export function headlessFromHeadedToggle(headed: boolean): boolean {
  return !headed;
}
