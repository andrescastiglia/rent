import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
@Injectable()
export class ContactDataPrivacyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    context
      .switchToHttp()
      .getResponse<{ setHeader: (name: string, value: string) => void }>()
      .setHeader('Cache-Control', 'no-store');
    // Use an already loaded agent only; never initialize telemetry from a request.
    const cached = require.cache[require.resolve('newrelic')]?.exports as
      { getTransaction?: () => { ignore?: () => void } } | undefined;
    cached?.getTransaction?.().ignore?.();
    return next.handle();
  }
}
