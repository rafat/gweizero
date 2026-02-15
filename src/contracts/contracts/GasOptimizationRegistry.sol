// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract GasOptimizationRegistry is ERC721, Ownable {
    struct OptimizationProof {
        bytes32 originalHash; // keccak256(original source code)
        bytes32 optimizedHash; // keccak256(optimized source code)
        address contractAddress; // target contract address (optional)
        string contractName;
        uint32 originalGas; // average gas before optimization
        uint32 optimizedGas; // average gas after optimization
        uint16 savingsPercent; // basis points. 1800 = 18.00%
        uint32 timestamp;
        uint16 chainId;
        address optimizer;
    }

    uint256 private _tokenIdCounter;
    mapping(uint256 => OptimizationProof) public proofs;
    mapping(address => uint256[]) public contractOptimizations;
    mapping(address => uint256[]) public optimizerHistory;

    event OptimizationProofMinted(
        uint256 indexed tokenId,
        address indexed optimizer,
        string contractName,
        uint16 savingsPercent
    );

    constructor(address initialOwner) ERC721("GweiZero Optimization Proof", "GZERO-PROOF") Ownable(initialOwner) {}

    function mintProof(
        bytes32 _originalHash,
        bytes32 _optimizedHash,
        address _contractAddress,
        string memory _contractName,
        uint32 _originalGas,
        uint32 _optimizedGas,
        uint16 _savingsPercent
    ) external returns (uint256) {
        require(_savingsPercent <= 10_000, "Invalid savings percent");

        uint256 tokenId = _tokenIdCounter;
        unchecked {
            _tokenIdCounter = tokenId + 1;
        }

        _safeMint(msg.sender, tokenId);

        proofs[tokenId] = OptimizationProof({
            originalHash: _originalHash,
            optimizedHash: _optimizedHash,
            contractAddress: _contractAddress,
            contractName: _contractName,
            originalGas: _originalGas,
            optimizedGas: _optimizedGas,
            savingsPercent: _savingsPercent,
            timestamp: uint32(block.timestamp),
            chainId: uint16(block.chainid),
            optimizer: msg.sender
        });

        if (_contractAddress != address(0)) {
            contractOptimizations[_contractAddress].push(tokenId);
        }
        optimizerHistory[msg.sender].push(tokenId);

        emit OptimizationProofMinted(tokenId, msg.sender, _contractName, _savingsPercent);
        return tokenId;
    }

    function getProof(uint256 tokenId) external view returns (OptimizationProof memory) {
        require(_ownerOf(tokenId) != address(0), "Proof does not exist");
        return proofs[tokenId];
    }

    function getContractOptimizations(address _contract) external view returns (uint256[] memory) {
        return contractOptimizations[_contract];
    }

    function getOptimizerHistory(address _optimizer) external view returns (uint256[] memory) {
        return optimizerHistory[_optimizer];
    }

    function getTotalProofs() external view returns (uint256) {
        return _tokenIdCounter;
    }
}
