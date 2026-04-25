type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[P] extends ReadonlyArray<infer X>
      ? ReadonlyArray<DeepPartial<X>>
      : T[P] extends object
        ? DeepPartial<T[P]>
        : T[P]
}

export default DeepPartial
