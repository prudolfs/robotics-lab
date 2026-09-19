import { runTypeScript } from './frontend'
self.onmessage = ({ data }) => {
	try {
		self.postMessage(runTypeScript(data.frames))
	} catch (error) {
		self.postMessage({ error: String(error) })
	}
}
