/* global __ENV, __ITER */

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const ragLatency = new Trend('rag_response_latency', true);
const ragErrors = new Rate('rag_response_errors');
const ragAbstentions = new Counter('rag_response_abstentions');

const rate = Number(__ENV.RAG_LOAD_RATE || 2);
const duration = __ENV.RAG_LOAD_DURATION || '5m';

export const options = {
  scenarios: {
    rag_read_load: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration,
      preAllocatedVUs: Math.max(10, rate * 2),
      maxVUs: Math.max(50, rate * 10),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    rag_response_errors: ['rate<0.01'],
    rag_response_latency: ['p(95)<8000'],
  },
};

const prompts = [
  '¿Qué propiedades hay disponibles?',
  'Describime las características de las propiedades disponibles',
  '¿Cuál es el estado de los contratos?',
  'Mostrame las facturas con saldo pendiente',
  'Resumí el estado y los detalles de mi cartera',
];

export default function () {
  const baseUrl = (__ENV.AI_EVAL_BASE_URL || 'http://127.0.0.1:3001').replace(
    /\/$/,
    '',
  );
  if (!__ENV.AI_LOAD_JWT) {
    throw new Error('AI_LOAD_JWT is required');
  }
  const prompt = prompts[__ITER % prompts.length];
  const response = http.post(
    `${baseUrl}/ai/respond`,
    JSON.stringify({ prompt }),
    {
      headers: {
        Authorization: `Bearer ${__ENV.AI_LOAD_JWT}`,
        'Content-Type': 'application/json',
      },
      timeout: '65s',
    },
  );
  ragLatency.add(response.timings.duration);
  const valid = check(response, {
    'status is 201': (result) => result.status === 201,
    'response has retrieval metadata': (result) => {
      try {
        const body = result.json();
        return (
          typeof body.retrieval?.strategy === 'string' &&
          typeof body.insufficientEvidence === 'boolean'
        );
      } catch {
        return false;
      }
    },
    'response does not expose evidence content': (result) => {
      try {
        const body = result.json();
        return (body.sources || []).every(
          (source) => !Object.prototype.hasOwnProperty.call(source, 'content'),
        );
      } catch {
        return false;
      }
    },
  });
  ragErrors.add(!valid);
  try {
    if (response.json().insufficientEvidence === true) ragAbstentions.add(1);
  } catch {
    ragErrors.add(true);
  }
}
