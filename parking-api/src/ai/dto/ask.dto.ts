import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class AskDto {
  @IsString()
  @IsNotEmpty({ message: 'La pregunta no puede estar vacía' })
  @MaxLength(500, { message: 'La pregunta no puede exceder 500 caracteres' })
  question: string;
}
