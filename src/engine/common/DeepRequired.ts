type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends Array<infer U>
    ? Array<DeepRequired<U>>
    : T[P] extends ReadonlyArray<infer X>
      ? ReadonlyArray<DeepRequired<X>>
      : T[P] extends object
        ? DeepRequired<T[P]>
        : T[P]
}

export default DeepRequired
