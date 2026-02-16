// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract GasOptimizerEasyDemo {
    // Intentional baseline choices that are safe to optimize.
    address public owner;
    uint256 public total;
    uint256[] public values;
    mapping(address => uint256) public points;
    bool public paused;

    constructor() {
        owner = msg.sender;
    }

    // Expected optimizations:
    // - memory -> calldata
    // - cache arr.length
    // - unchecked ++i
    // - custom errors (replace require strings)
    function seedValues(uint256[] memory arr) public {
        require(msg.sender == owner, "only owner");
        require(!paused, "paused");

        for (uint256 i = 0; i < arr.length; i++) {
            values.push(arr[i]);
            total += arr[i];
        }
    }

    // Expected optimizations:
    // - memory -> calldata
    // - cache arr.length
    // - unchecked ++i
    // - cache storage pointer or storage reads
    function batchSetPoints(address[] memory users, uint256[] memory pts) public {
        require(msg.sender == owner, "only owner");
        require(users.length == pts.length, "length mismatch");

        for (uint256 i = 0; i < users.length; i++) {
            points[users[i]] = points[users[i]] + pts[i];
        }
    }

    // Expected optimizations:
    // - cache values.length
    // - unchecked ++i
    // - avoid repeated storage reads
    function sumValues() public view returns (uint256 s) {
        for (uint256 i = 0; i < values.length; i++) {
            s += values[i];
        }
    }

    // Small mutable function for baseline comparison.
    function setPaused(bool p) public {
        require(msg.sender == owner, "only owner");
        paused = p;
    }
}
