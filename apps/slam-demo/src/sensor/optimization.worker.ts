import { type BundleJob, runBundleJob } from '@robotics-lab/vision'

self.onmessage = ({ data }: { data: BundleJob }) => {
	self.postMessage(runBundleJob(data))
}
