# Octo-AWS-CDK

## Checklist to create a new Model
In order to create a new model,

1. Create a new model in `src/models`
2. Register the new model in `index.ts`
3. If the model requires creation of new Anchors,
   1. Create new anchor in `src/anchors` 
   2. Register the new anchor in `index.ts`
4. Create actions for model in `src/models/<new model>/actions`
5. Register new model actions in `index.ts`
6. If the model requires creation of new Resources,
   1. Create new resource in `src/resources`
   2. Register the new resource in `index.ts`
   3. Create actions for resource in `src/resources/<new resource>/actions`
   4. Register new resource actions in `index.ts`
