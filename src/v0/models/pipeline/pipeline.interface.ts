import { Pipeline } from './pipeline.model';

export interface IPipeline {
  handlerName: Pipeline['handlerName'];
  handlerPathInSource: Pipeline['handlerPathInSource'];
  permissionSet: Pipeline['permissionSet'];
  pipelineName: Pipeline['pipelineName'];
}
