import { describe, expect, it } from 'vitest';
import { RequestOutcome } from '../src/main/request-outcome';

describe('本轮请求的持久化结果', () => {
  it('行程保存后超时，保留成功结果而不是报告整轮失败', () => {
    const outcome = new RequestOutcome();
    outcome.saved('plan');
    expect(outcome.failure(new Error('aborted'), { timedOut: true })).toBe(
      '行程已保存，后续回复超时。已保存的内容可在行程中查看。',
    );
  });

  it('不沿用之前请求的成功状态，也不将未成功的操作计为保存', () => {
    const previous = new RequestOutcome();
    previous.saved('plan');
    expect(new RequestOutcome().failure(new Error('aborted'), { timedOut: true })).toBe(
      '本次请求未完成：处理超时，请稍后重试。',
    );
  });

  it('后台整理超时时明确整理阶段，并保留已保存的资料', () => {
    const outcome = new RequestOutcome();
    outcome.saved('journal');
    expect(outcome.failure(new Error('aborted'), { timedOut: true, syncing: true })).toBe(
      '旅行资料已保存，后续整理超时。已保存的内容可在行程中查看。',
    );
    expect(
      new RequestOutcome().failure(new Error('aborted'), { timedOut: true, syncing: true }),
    ).toBe('回复已完成，但共享旅行资料整理超时。');
  });

  it('用户取消不追加失败消息；保存后的非超时错误不丢失成功信息且隐藏密钥', () => {
    const outcome = new RequestOutcome();
    outcome.saved('plan');
    outcome.saved('journal');
    expect(outcome.failure(new Error('aborted'), { cancelled: true, timedOut: true })).toBeNull();
    expect(outcome.failure(new Error('failed secret'), { secrets: ['secret'] })).toBe(
      '行程和旅行资料已保存，后续处理未完成：failed [密钥已隐藏]',
    );
  });
});
