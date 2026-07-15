import { AiIntentClassifierService } from './ai-intent-classifier.service';

describe('AiIntentClassifierService', () => {
  const service = new AiIntentClassifierService();

  it.each([
    ['creá una propiedad', 'mutation'],
    ['cuál es mi saldo vencido', 'structured'],
    ['explicame qué dice este documento', 'semantic'],
    ['qué documentos hay de mi contrato', 'semantic'],
    ['listá propiedades en venta con sus importes', 'structured'],
    ['mostrame mis contratos', 'structured'],
    ['resumí el estado y los detalles del contrato', 'hybrid'],
    ["propiedad' OR 1=1 --", 'unsupported'],
  ])('classifies %s as %s', (prompt, expected) => {
    expect(service.classify(prompt)).toBe(expected);
  });
});
