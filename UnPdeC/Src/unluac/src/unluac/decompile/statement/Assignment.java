package unluac.decompile.statement;

import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;

import unluac.decompile.Declaration;
import unluac.decompile.Decompiler;
import unluac.decompile.Output;
import unluac.decompile.Walker;
import unluac.decompile.expression.ConstantExpression;
import unluac.decompile.expression.Expression;
import unluac.decompile.target.Target;

public class Assignment extends Statement {

  private final ArrayList<Target> targets = new ArrayList<Target>(5);
  private final ArrayList<Expression> values = new ArrayList<Expression>(5);
  private final ArrayList<Integer> lines = new ArrayList<Integer>(5);
  
  private boolean allnil = true;
  private boolean declare = false;
  private int declareStart = 0;
  private int register = -1;
  
  public Assignment() {
    
  }
  
  @Override
  public void walk(Walker w) {
    w.visitStatement(this);
    for(Target target : targets) {
      target.walk(w);
    }
    for(Expression expression : values) {
      expression.walk(w);
    }
  }
  
  @Override
  public boolean beginsWithParen() {
    return !declare && targets.get(0).beginsWithParen();
  }
  
  public Target getFirstTarget() {
    return targets.get(0);
  }
  
  public Target getLastTarget() {
    return targets.get(targets.size() - 1);
  }
  
  public Expression getFirstValue() {
    return values.get(0);
  }
  
  public void replaceLastValue(Expression value) {
    values.set(values.size() - 1, value);
  }
  
  public int getFirstLine() {
    return lines.get(0);
  }
  
  public boolean assignsTarget(Declaration decl) {
    for(Target target : targets) {
      if(target.isDeclaration(decl)) {
        return true;
      }
    }
    return false;
  }
  
  public int getArity() {
    return targets.size();
  }
  
  public Assignment(Target target, Expression value, int line) {
    targets.add(target);
    values.add(value);
    lines.add(line);
    allnil = allnil && value.isNil();
  }

  public void addFirst(Target target, Expression value, int line) {
    targets.add(0, target);
    values.add(0, value);
    lines.add(0, line);
    allnil = allnil && value.isNil();
  }
  
  public void addLast(Target target, Expression value, int line) {
    if(targets.contains(target)) {
      int index = targets.indexOf(target);
      targets.remove(index);
      value = values.remove(index);
      lines.remove(index);
    }
    int index = targets.size();
    targets.add(target);
    values.add(index, value);
    lines.add(index, line);
    allnil = allnil && value.isNil();
  }
  
  public boolean hasExcess() {
    return values.size() > targets.size();
  }
  
  public void addExcessValue(Expression value, int line, int register) {
    values.add(value);
    lines.add(line);
    allnil = false; // Excess can't be implicit
    int firstRegister = register - (values.size() - 1);
    if(this.register != -1 && this.register != firstRegister) throw new IllegalStateException();
    this.register = firstRegister;
  }
  
  public int getRegister(int index) {
    if(index < 0 || index >= values.size()) throw new IndexOutOfBoundsException();
    if(register == -1) throw new IllegalStateException();
    return register + index;
  }
  
  public int getLastRegister() {
    return getRegister(values.size() - 1);
  }
  
  public Expression getValue(int target) {
    int index = 0;
    for(Target t : targets) {
      if(t.isLocal() && t.getIndex() == target) {
        return values.get(index);
      }
      index++;
    }
    throw new IllegalStateException();
  }
  
  public void replaceValue(int target, Expression value) {
    int index = 0;
    for(Target t : targets) {
      if(t.isLocal() && t.getIndex() == target) {
        values.set(index, value);
        //lines.set(index, line);
        return;
      }
      index++;
    }
    throw new IllegalStateException();
  }
  
  public boolean assignListEquals(List<Declaration> decls) {
    if(decls.size() != targets.size()) return false;
    for(Target target : targets) {
      boolean found = false;
      for(Declaration decl : decls) {
        if(target.isDeclaration(decl)) {
          found = true;
          break;
        }
      }
      if(!found) return false;
    }
    return true;
  }
  
  public void declare(int declareStart) {
    declare = true;
    this.declareStart = declareStart;
  }
  
  public boolean isDeclaration() {
    return declare;
  }
  
  public boolean assigns(Declaration decl) {
    for(Target target : targets) {
      if(target.isDeclaration(decl)) return true;
    }
    return false;
  }
  
  public boolean canDeclare(List<Declaration> locals) {
    for(Target target : targets) {
      boolean isNewLocal = false;
      for(Declaration decl : locals) {
        if(target.isDeclaration(decl)) {
          isNewLocal = true;
          break;
        }
      }
      if(!isNewLocal) {
        return false;
      }
    }
    return true;
  }
  
  /**
   * Check if a closure expression can use function sugar syntax
   * (i.e., "local function name() ... end" instead of "local name = function() ... end")
   *
   * Relaxed for Lua 5.1 compiled bytecode where CLOSURE instruction line numbers
   * may differ from local variable begin line numbers (compiler optimization).
   */
  private boolean canUseFunctionSugar(Target target, Expression value) {
    if(!value.isClosure() || !target.isFunctionName()) {
      return false;
    }
    // If this is a declaration and the target is a local variable, always allow
    // function sugar. The strict declareStart >= closureUpvalueLine() check
    // fails when the compiler optimizes CLOSURE instruction placement.
    if(declare && target.isLocal()) {
      return true;
    }
    Expression closure = value;
    if(!declare || declareStart >= closure.closureUpvalueLine()) {
      return true;
    }
    if(target.isLocal() && closure.isUpvalueOf(target.getIndex())) {
      return true;
    }
    return false;
  }
  
  /**
   * Check if this assignment should be split into separate statements.
   * When declare is true and there are multiple targets with at least one
   * closure value, the combined form "local a, b = function()...end, val"
   * is incorrect and should be split into:
   *   local function a()...end
   *   local b = val
   */
  private boolean shouldSplitForClosure() {
    if(!declare || targets.size() <= 1) return false;
    // Check if any value is a closure expression
    for(int i = 0; i < Math.min(targets.size(), values.size()); i++) {
      if(values.get(i).isClosure()) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Check if this assignment has mixed local and non-local targets.
   * E.g., "local ui.xxx.Maximum, SafeSetCBX = 95, ui.xxx" is invalid Lua
   * because "local" cannot prefix a table target like "ui.xxx.Maximum".
   * Should be split into:
   *   ui.xxx.Maximum = 95
   *   local SafeSetCBX = ui.xxx
   */
  private boolean shouldSplitForMixedTargets() {
    if(!declare || targets.size() <= 1) return false;
    boolean hasLocal = false;
    boolean hasNonLocal = false;
    for(Target target : targets) {
      if(target.isLocal()) {
        hasLocal = true;
      } else {
        hasNonLocal = true;
      }
    }
    return hasLocal && hasNonLocal;
  }
  
  /**
   * Check if this assignment has excess values that don't correspond to targets.
   * This can happen when the compiler reorders CLOSURE instructions, causing
   * register residual values to be treated as initial values for local variables.
   * E.g., "local a, b = expr, <residual>" where b should be assigned a closure later.
   */
  private boolean shouldSplitForExcessValues() {
    if(!declare || targets.size() <= 1) return false;
    // If there are excess values (more values than targets), this is likely
    // a merged assignment that should be split
    if(values.size() > targets.size()) return true;
    // Check if any target's value is a LocalVariable reference (residual from
    // another register). This indicates the compiler placed CLOSURE instructions
    // on a different line than the local variable declaration, causing the
    // register's residual value to be used as the initial value.
    for(int i = 0; i < Math.min(targets.size(), values.size()); i++) {
      if(targets.get(i).isLocal() && values.get(i) instanceof unluac.decompile.expression.LocalVariable) {
        // A local variable being assigned the value of another local variable
        // in a multi-target declaration is suspicious
        return true;
      }
    }
    return false;
  }
  
  /**
   * Check if this assignment has mixed nil and non-nil values in a
   * multi-target declaration. This happens when residual values are
   * replaced with nil (by the Decompiler), creating a pattern like
   * "local a, b = expr" where b gets nil. Splitting produces cleaner output:
   * "local a = expr" + "local b".
   */
  private boolean shouldSplitForNilTargets() {
    if(!declare || targets.size() <= 1) return false;
    boolean hasNil = false;
    boolean hasNonNil = false;
    for(int i = 0; i < Math.min(targets.size(), values.size()); i++) {
      if(values.get(i).isNil() && values.get(i).getConstantIndex() == -1) {
        hasNil = true;
      } else {
        hasNonNil = true;
      }
    }
    return hasNil && hasNonNil;
  }
  
  /**
   * Check if this assignment should be split into separate statements.
   */
  private boolean shouldSplitDeclaration() {
    return shouldSplitForClosure() || shouldSplitForMixedTargets() || shouldSplitForExcessValues() || shouldSplitForNilTargets();
  }
  
  @Override
  public void print(Decompiler d, Output out) {
    if(!targets.isEmpty()) {
      // Split multi-target declarations that contain closures
      // E.g., "local a, b = function()...end, value" should be split into:
      //   local function a()...end
      //   local b = value
      if(shouldSplitDeclaration()) {
        for(int i = 0; i < targets.size(); i++) {
          Target target = targets.get(i);
          Expression value = (i < values.size()) ? values.get(i) : ConstantExpression.createNil(0);
          if(target.isLocal() && canUseFunctionSugar(target, value)) {
            // Use function sugar: local function name() ... end
            out.paragraph();
            out.print("local ");
            value.printClosure(d, out, target);
            out.println();
            out.paragraph();
          } else if(target.isLocal() && value.isClosure()) {
            // Closure but can't use sugar: local name = function() ... end
            out.print("local ");
            target.print(d, out, true);
            out.print(" = ");
            value.print(d, out);
            out.println();
          } else if(target.isLocal()) {
            // Regular local declaration: local name = value
            out.print("local ");
            target.print(d, out, true);
            if(!value.isNil() || value.getConstantIndex() != -1) {
              out.print(" = ");
              value.print(d, out);
            }
            out.println();
          } else {
            // Non-local target (table/global/upvalue): plain assignment
            target.print(d, out, false);
            out.print(" = ");
            value.print(d, out);
            out.println();
          }
        }
        if(comment != null) {
          out.print(" -- ");
          out.print(comment);
        }
        return;
      }
      
      boolean functionSugar = false;
      if(targets.size() == 1 && values.size() == 1 && values.get(0).isClosure() && targets.get(0).isFunctionName()) {
        functionSugar = canUseFunctionSugar(targets.get(0), values.get(0));
      }
      if(functionSugar) {
        out.paragraph();
      }
      if(declare) {
        out.print("local ");
      }
      if(!functionSugar) {
        targets.get(0).print(d, out, declare);
        for(int i = 1; i < targets.size(); i++) {
          out.print(", ");
          targets.get(i).print(d, out, declare);
        }
        if(!declare || !allnil) {
          out.print(" = ");
          
          LinkedList<Expression> expressions = new LinkedList<Expression>();
          
          int size = values.size();
          if(size >= 2 && values.get(size - 1).isNil() && (lines.get(size - 1) == values.get(size - 1).getConstantLine() || values.get(size - 1).getConstantLine() == -1)) {
            
            expressions.addAll(values);
            
          } else {
          
            boolean include = false;
            for(int i = size - 1; i >= 0; i--) {
              Expression value = values.get(i);
              if(include || !value.isNil() || value.getConstantIndex() != -1) {
                include = true;
              }
              if(include) {
                expressions.addFirst(value);
              }
            }
            
            if(expressions.isEmpty() && !declare) {
              expressions.addAll(values);
            }
          }
          
          Expression.printSequence(d, out, expressions, false, targets.size() > expressions.size());
        }
      } else {
        values.get(0).printClosure(d, out, targets.get(0));
        out.paragraph();
      }
      if(comment != null) {
        out.print(" -- ");
        out.print(comment);
      }
    }
  }
  
}
