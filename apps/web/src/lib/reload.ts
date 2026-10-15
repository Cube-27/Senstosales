// Reloading the app after its data changed underneath it (a restore, SPEC-21). The shell loads the same loopback page
// the API serves (ARCHITECTURE §13.1), so a page reload is the app reload in a browser and in the shell alike.
export const reloadApp = (): void => window.location.reload();
