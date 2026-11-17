import { ExecutionFailureReason } from '@domain/enums/execution-job.enum';
import { StartRepairRequestDto } from './start-repair.dto';
import { FinishJobRequestDto } from './finish-job.dto';
import { plainToInstance } from 'class-transformer';
import { FailJobRequestDto } from './fail-job.dto';
import { validate } from 'class-validator';

type DtoClass = new () => object;

const errorsOf = async (dto: DtoClass, body: object) =>
  (await validate(plainToInstance(dto, body))).map((error) => error.property);

describe('request DTOs', () => {
  it('fail requires a known reason and a detail', async () => {
    expect(
      await errorsOf(FailJobRequestDto, {
        reason: ExecutionFailureReason.TECHNICAL_ISSUE,
        detail: 'Motor travado',
      }),
    ).toEqual([]);
    expect(await errorsOf(FailJobRequestDto, { reason: 'BROKEN' })).toEqual([
      'reason',
      'detail',
    ]);
  });

  it.each([
    [StartRepairRequestDto, 'diagnosisNotes'],
    [FinishJobRequestDto, 'note'],
  ])('%p accepts an empty body and limits the text', async (dto, field) => {
    expect(await errorsOf(dto, {})).toEqual([]);
    expect(await errorsOf(dto, { [field]: 'x'.repeat(2001) })).toEqual([field]);
  });
});
