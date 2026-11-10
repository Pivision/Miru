import { useEffect, useState } from 'react';

/** 搜索框的受控状态：本地可打字，URL 里的 q 变了就跟着拉回。全站三处搜索框共用这份「打字期间 URL 不变所以不被打断、后退/点建议词/清除后又能回显」的逻辑。 */
export function useUrlTerm(q: string): [string, (next: string) => void] {
  const [term, setTerm] = useState(q);

  useEffect(() => setTerm(q), [q]);

  return [term, setTerm];
}
