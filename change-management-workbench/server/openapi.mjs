// OpenAPI 3 description of the REST API, generated from the entity schema and the operations registry
// (INT-007, STD-03).
import { ENTITIES } from '../shared/schema.js';

const typeSchema = (fd) => {
  switch (fd.type) {
    case 'int': return { type: 'integer' };
    case 'number': case 'money': return { type: 'number' };
    case 'bool': return { type: 'boolean' };
    case 'date': return { type: 'string', format: 'date' };
    case 'datetime': return { type: 'string', format: 'date-time' };
    case 'multi': case 'refs': case 'users': case 'adkar': return { type: 'array', items: { type: 'string' } };
    case 'table': return { type: 'array', items: { type: 'object', properties: Object.fromEntries((fd.columns || []).map((c) => [c.key, { ...typeSchema(c), description: c.label }])) } };
    case 'json': return { type: 'object', additionalProperties: true };
    default: return { type: 'string' };
  }
};

export function buildOpenApi(service, { version = '1.0.0', serverUrl = '/' } = {}) {
  const schemas = {
    Error: { type: 'object', properties: { error: { type: 'string' }, details: {} } },
    SystemFields: { type: 'object', properties: { id: { type: 'string' }, code: { type: 'string' }, version: { type: 'integer', description: 'Optimistic concurrency version; send it back when updating.' }, createdAt: { type: 'string', format: 'date-time' }, createdBy: { type: 'string' }, updatedAt: { type: 'string', format: 'date-time' }, updatedBy: { type: 'string' }, initiativeId: { type: 'string', nullable: true } } },
  };
  for (const [type, e] of Object.entries(ENTITIES)) {
    schemas[type] = {
      description: `${e.label} (${e.module}). ${e.scope === 'initiative' ? 'Belongs to an initiative.' : 'Enterprise-level record.'}`,
      allOf: [{ $ref: '#/components/schemas/SystemFields' }, {
        type: 'object',
        required: e.fields.filter((f) => f.required).map((f) => f.key),
        properties: Object.fromEntries(e.fields.filter((f) => !f.hidden).map((f) => [f.key, { ...typeSchema(f), description: `${f.label}${f.sensitive ? ' (sensitive: returned only to authorised roles)' : ''}${f.ref ? ` → ${f.ref}` : ''}${f.list ? ` (reference list: ${f.list})` : ''}` }])),
      }],
    };
  }
  const recordTypes = Object.keys(ENTITIES).filter((t) => !['notification', 'apiClient', 'webhook'].includes(t));
  const errorResponses = {
    401: { description: 'Not signed in', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    403: { description: 'Not permitted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    409: { description: 'Conflict: the record was changed by someone else (optimistic concurrency)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    422: { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    429: { description: 'Rate limit exceeded' },
  };
  const paths = {
    '/api/oauth/token': {
      post: { tags: ['Authentication'], summary: 'OAuth 2.0 client credentials grant', security: [], requestBody: { content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: { grant_type: { type: 'string', enum: ['client_credentials'] }, client_id: { type: 'string' }, client_secret: { type: 'string' } } } } } }, responses: { 200: { description: 'Access token' } } },
    },
    '/api/v1/bootstrap': { get: { tags: ['Session'], summary: 'Configuration, initiatives and directory for the signed-in user', responses: { 200: { description: 'OK' }, ...errorResponses } } },
    '/api/v1/initiatives/{id}/data': { get: { tags: ['Initiatives'], summary: 'All records of an initiative visible to the caller', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' }, ...errorResponses } } },
    '/api/v1/initiatives/{id}/changes': { get: { tags: ['Initiatives'], summary: 'Records changed since a sequence number', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'since', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
    '/api/v1/records/{type}': {
      get: { tags: ['Records'], summary: 'List records of a type', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string', enum: recordTypes } }, { name: 'initiativeId', in: 'query', schema: { type: 'string' } }, { name: 'q', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }, { name: 'offset', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'Rows and total' }, ...errorResponses } },
      post: { tags: ['Records'], summary: 'Create a record', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string', enum: recordTypes } }], requestBody: { content: { 'application/json': { schema: { type: 'object', description: 'Fields of the record type (see components)' } } } }, responses: { 201: { description: 'Created' }, ...errorResponses } },
    },
    '/api/v1/records/{type}/{id}': {
      get: { tags: ['Records'], summary: 'Read a record', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }, { name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' }, ...errorResponses } },
      patch: { tags: ['Records'], summary: 'Update a record (send the version you read in If-Match or the body)', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }, { name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'If-Match', in: 'header', schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object' }, version: { type: 'integer' }, reason: { type: 'string' } } } } } }, responses: { 200: { description: 'Updated' }, ...errorResponses } },
      delete: { tags: ['Records'], summary: 'Delete (archive) a record', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }, { name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'reason', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, ...errorResponses } },
    },
    '/api/v1/files/{blobId}': { get: { tags: ['Files'], summary: 'Download an artefact, attachment or export', parameters: [{ name: 'blobId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'File content' }, ...errorResponses } } },
    '/api/v1/search': { get: { tags: ['Search'], summary: 'Global search across records the caller may view (WFL-006)', parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Hits' } } } },
    '/api/v1/reporting/{dataset}': { get: { tags: ['Reporting'], summary: 'Read-only reporting feed for BI tools (RPT-005)', parameters: [{ name: 'dataset', in: 'path', required: true, schema: { type: 'string', enum: ['initiatives', 'groups', 'stakeholders', 'engagements', 'activities', 'adkar', 'measures', 'risks'] } }, { name: 'initiativeId', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Rows' }, ...errorResponses } } },
    '/api/public/surveys/{token}': { get: { tags: ['Public surveys'], summary: 'Survey content for respondents (no sign-in)', security: [], parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Survey' } } } },
    '/api/public/surveys/{token}/responses': { post: { tags: ['Public surveys'], summary: 'Submit a survey response (no sign-in)', security: [], parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Accepted' } } } },
  };
  for (const [name, meta] of Object.entries(service.opMeta)) {
    if (meta.internal || name.startsWith('_')) continue;
    paths[`/api/v1/ops/${name}`] = { post: { tags: ['Operations'], operationId: name, summary: meta.summary || name, description: `Permission area: ${meta.area || 'workflow'}.`, requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, responses: { 200: { description: 'OK' }, ...errorResponses } } };
  }
  return {
    openapi: '3.0.3',
    info: { title: 'Change Management Workbench API', version, description: 'REST API for the Change Management Workbench. All requests are authorised with the caller\'s roles, record access and field-level security; writes are audited. Use OAuth 2.0 client credentials (POST /api/oauth/token) for integrations. Rate limits apply. Deprecations are announced at least six months ahead (STD-03).' },
    servers: [{ url: serverUrl }],
    security: [{ bearer: [] }, { cookie: [] }],
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', description: 'Access token from the client credentials grant' },
        cookie: { type: 'apiKey', in: 'cookie', name: 'cmw_sid', description: 'Browser session (state-changing requests also need the X-CMW header)' },
      },
      schemas,
    },
    paths,
  };
}
