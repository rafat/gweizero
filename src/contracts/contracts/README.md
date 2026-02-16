# GweiZero Demo Contracts

This folder contains Solidity contracts designed to test and demonstrate the GweiZero gas optimization pipeline.

## Contract Overview

### 1. GasOptimizerEasyDemo.sol
**Complexity:** ⭐ Beginner  
**Lines of Code:** ~60  
**Functions:** 5  
**Best for:** Quick testing, understanding basic optimizations

**Optimization Opportunities:**
- `memory` → `calldata` for read-only parameters
- Cache array length in loops
- `unchecked` for loop increments
- Custom errors instead of require strings

```solidity
// Before
function seedValues(uint256[] memory arr) public {
    for (uint256 i = 0; i < arr.length; i++) {
        values.push(arr[i]);
    }
}

// After
function seedValues(uint256[] calldata arr) external {
    uint256 len = arr.length;
    for (uint256 i = 0; i < len;) {
        values.push(arr[i]);
        unchecked { ++i; }
    }
}
```

---

### 2. GasOptimizerDemo.sol
**Complexity:** ⭐⭐ Intermediate  
**Lines of Code:** ~150  
**Functions:** 9  
**Best for:** Standard testing, AI optimization validation

**Optimization Opportunities:**
- Storage packing (struct reordering)
- `immutable` for constructor-only variables
- Cache array length in multiple loops
- Remove redundant `whitelist` mapping
- `unchecked` math in safe contexts
- Memory → calldata for external functions

**Key Functions:**
- `addUsers()` - Batch user creation with storage writes
- `batchBumpScore()` - Loop with storage updates
- `activeScoreTotal()` - View function with iteration
- `findUsersByPrefix()` - String comparison in loops

---

### 3. GasOptimizerAdvanced.sol
**Complexity:** ⭐⭐⭐ Complex  
**Lines of Code:** ~300  
**Functions:** 16  
**Best for:** Production-like testing, comprehensive optimization analysis

**Contract Features:**
- Complex struct with packing opportunities
- Multiple mappings and arrays
- Admin functions + user functions
- Reward pool mechanism
- Tier system
- Batch operations

**Optimization Opportunities:**
1. **Storage Packing:**
   - Combine `version`, `paused`, `minTier`, `rewardsEnabled` into single slot
   - Reorder `Account` struct for optimal packing

2. **Immutable Variables:**
   - `owner` (set only in constructor)
   - `stakingToken` (never modified)

3. **Loop Optimizations:**
   - Cache `allUsers.length` in `getAllUsers()`
   - Cache `amounts.length` in `batchStake()`
   - Use `unchecked` for loop increments

4. **Calldata Usage:**
   - `batchStake(uint256[] calldata amounts)`
   - `batchWithdraw(uint256[] calldata amounts)`
   - `claimRewards(uint256[] calldata poolIds)`

5. **Storage Pointer Caching:**
   ```solidity
   // Before
   for (uint256 i = 0; i < users.length; i++) {
       accounts[users[i]].tier = newTiers[i];
   }
   
   // After
   for (uint256 i = 0; i < users.length; i++) {
       Account storage account = accounts[users[i]];
       account.tier = newTiers[i];
   }
   ```

6. **Custom Errors:**
   ```solidity
   // Replace
   require(msg.sender == owner, "Not authorized");
   
   // With
   error NotAuthorized();
   if (msg.sender != owner) revert NotAuthorized();
   ```

7. **Unchecked Math:**
   ```solidity
   // Safe to use unchecked for increments
   for (uint256 i = 0; i < amounts.length;) {
       // ... logic ...
       unchecked { ++i; }
   }
   ```

---

## Testing

### Compile All Contracts
```bash
cd src/contracts
npx hardhat compile
```

### Run Tests
```bash
# All tests
npx hardhat test

# Specific contract
npx hardhat test test/GasOptimizerAdvanced.ts
```

### Expected Test Results
```
GasOptimizerAdvanced
  ✔ Should deploy and initialize correctly
  ✔ Should create account successfully
  ✔ Should batch stake successfully
  ✔ Should handle batch withdraw
  ✔ Should create reward pool and claim rewards
  ✔ Should handle batch transfer
  ✔ Should get all users
  ✔ Should get platform stats

8 passing (~500ms)
```

---

## Contract Sizes

| Contract | Deployed Bytecode | Status |
|----------|------------------|--------|
| GasOptimizerEasyDemo | ~8 KB | ✅ Under limit |
| GasOptimizerDemo | ~12 KB | ✅ Under limit |
| GasOptimizerAdvanced | ~17.6 KB | ✅ Under limit |

**EIP-170 Limit:** 24,576 bytes (24 KB)

---

## Usage with GweiZero

### 1. Via Frontend
1. Start backend: `cd src/backend && npm run dev`
2. Start frontend: `cd src/frontend && npm run dev`
3. Open `http://localhost:3000`
4. Paste contract code or upload `.sol` file
5. Click "Analyze Gas"

### 2. Via API
```bash
curl -X POST http://localhost:3001/api/analyze/jobs \
  -H "Content-Type: application/json" \
  -d "{\"code\": \"$(cat GasOptimizerAdvanced.sol)\"}"
```

### 3. Expected Analysis Time
- **EasyDemo:** ~25-35 seconds
- **Demo:** ~35-50 seconds
- **Advanced:** ~45-70 seconds

---

## Gas Optimization Checklist

When analyzing these contracts, look for:

### High Impact (>5% savings)
- [ ] Storage packing (combine variables)
- [ ] Immutable variables
- [ ] Calldata instead of memory
- [ ] Remove redundant storage

### Medium Impact (2-5% savings)
- [ ] Cache array lengths
- [ ] Storage pointer caching
- [ ] Custom errors
- [ ] External vs public

### Low Impact (<2% savings)
- [ ] Unchecked math
- [ ] Memory optimizations
- [ ] Inline functions
- [ ] Short-circuit evaluation

---

## License

MIT
