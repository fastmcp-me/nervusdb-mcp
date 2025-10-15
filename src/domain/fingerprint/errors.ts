import { DomainError } from '../shared/errors.js';

export class IndexNotFoundError extends DomainError {
  readonly code = 'INDEX_NOT_FOUND';
  readonly isOperational = true;

  constructor(message = '索引不存在，请先运行 synapse:index 完成影子构建') {
    super(message);
  }
}

export class FingerprintMismatchError extends DomainError {
  readonly code = 'FINGERPRINT_MISMATCH';
  readonly isOperational = true;

  constructor(message = '索引指纹已失效，请重新运行 synapse:index 重建知识图谱') {
    super(message);
  }
}
