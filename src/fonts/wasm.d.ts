declare module "*.wasm" {
	const mod: WebAssembly.Module;
	export default mod;
}

declare module "yoga-wasm-web/dist/yoga.wasm" {
	const mod: WebAssembly.Module;
	export default mod;
}
