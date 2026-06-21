import {
  CallHandler,
  ClassSerializerInterceptor,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { SKIP_SERIALIZE_KEY } from '../decorators/skip-serialize.decorator';

@Injectable()
export class ConditionalSerializerInterceptor extends ClassSerializerInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const reflector = this.reflector as Reflector;
    const skip = reflector.getAllAndOverride<boolean>(SKIP_SERIALIZE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip) {
      return next.handle();
    }

    return super.intercept(context, next);
  }
}
