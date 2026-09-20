import { type GraphJob, optimizeGraph } from '@robotics-lab/vision'

self.onmessage = ({ data }: { data: GraphJob }) => self.postMessage(optimizeGraph(data))
