import { useEffect } from 'react';

type AnyFn = (...args: any[]) => any;

function isFunction(value: unknown): value is AnyFn {
  return typeof value === "function";
}
export default function useAsyncEffect<V>(
  asyncEffect: () => Promise<V>,
  param2?: any,
  param3?: any
): void {
  const cleanFunction = isFunction(param2) ? param2 : undefined;
  const dependenceList = isFunction(param2) ? param3 : param2;
  useEffect(() => {
    asyncEffect();
    return cleanFunction;
  }, dependenceList);
}
