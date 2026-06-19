import * as dotenv from 'dotenv';
import * as path from 'path';

export default function setup() {
  dotenv.config({
    path: path.resolve(__dirname, '../.env.test'),
  });
}
