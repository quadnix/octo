export class TaskDefinitionUtility {
  static getIncrementsOf1024(till: number, startFrom = 1, multipleOf = 1): number[] {
    const increments: number[] = [];
    for (let i = startFrom; i <= till; i++) {
      increments.push(1024 * i * multipleOf);
    }
    return increments;
  }

  static isCpuAndMemoryValid(cpu: number, memory: number): boolean {
    if (![256, 512, 1024, 2048, 4096, 8192, 16384].includes(cpu)) {
      return false;
    }

    switch (cpu) {
      case 256: {
        return [512, ...this.getIncrementsOf1024(2)].includes(memory);
      }
      case 512: {
        return [...this.getIncrementsOf1024(4)].includes(memory);
      }
      case 1024: {
        return [...this.getIncrementsOf1024(8, 2)].includes(memory);
      }
      case 2048: {
        return [...this.getIncrementsOf1024(16, 4)].includes(memory);
      }
      case 4096: {
        return [...this.getIncrementsOf1024(30, 8)].includes(memory);
      }
      case 8192: {
        return [...this.getIncrementsOf1024(15, 4, 4)].includes(memory);
      }
      default: {
        return [...this.getIncrementsOf1024(15, 4, 8)].includes(memory);
      }
    }
  }
}
