import { parse, visit } from '@solidity-parser/parser';

export class GasProfilerService {
  public static analyze(code: string) {
    try {
      const ast = parse(code, { tolerant: true });

      let functions: any[] = [];
      let contractName = '';

      visit(ast, {
        ContractDefinition: (node) => {
          contractName = node.name;
        },
        FunctionDefinition: (node) => {
          functions.push({
            name: node.name,
            visibility: node.visibility,
            stateMutability: node.stateMutability,
          });
        },
      });

      console.log(`Parsed contract: ${contractName}`);
      console.log(`Found ${functions.length} functions`);

      return {
        contractName,
        functions,
      };
    } catch (e: any) {
      console.error('Error parsing contract:', e.message);
      throw new Error('Failed to parse Solidity code.');
    }
  }
}
