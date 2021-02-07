export class Canon {
  public admit<T>(value: T): T;
  public admit(value: any) {
    return value;
  }
}
