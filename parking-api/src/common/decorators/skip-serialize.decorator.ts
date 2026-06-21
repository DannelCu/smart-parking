import { SetMetadata } from '@nestjs/common';

export const SKIP_SERIALIZE_KEY = 'skipSerialize';
export const SkipSerialize = () => SetMetadata(SKIP_SERIALIZE_KEY, true);
